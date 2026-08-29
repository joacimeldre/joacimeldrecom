import { defineMiddleware } from "astro:middleware";

const BLOCKED_AI_USER_AGENTS = [
  "gptbot",
  "chatgpt-user",
  "claudebot",
  "ccbot",
  "perplexitybot",
  "google-extended",
];

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 90;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const getRateLimitStore = () => {
  const globalKey = "__siteRateLimitStore";
  const globalObj = globalThis as Record<string, unknown>;

  if (!(globalObj[globalKey] instanceof Map)) {
    globalObj[globalKey] = new Map<string, RateLimitEntry>();
  }

  return globalObj[globalKey] as Map<string, RateLimitEntry>;
};

const getClientIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim();
  return ip || "unknown-ip";
};

const isBlockedAiCrawler = (userAgent: string) => {
  const normalized = userAgent.toLowerCase();
  return BLOCKED_AI_USER_AGENTS.some((token) => normalized.includes(token));
};

const shouldRateLimitPath = (pathname: string) => {
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_astro/")) return false;
  if (pathname.startsWith("/.well-known/")) return false;

  // Skip static assets and focus rate limiting on page/document requests.
  return !/\.[a-z0-9]+$/i.test(pathname);
};

const applyRateLimit = (key: string, now: number) => {
  const store = getRateLimitStore();

  // Entries are only ever overwritten on revisit, so drop stale keys to bound memory.
  if (store.size > 5_000) {
    for (const [storedKey, entry] of store) {
      if (entry.resetAt <= now) store.delete(storedKey);
    }
  }

  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, count: 1, resetAt };
  }

  const nextCount = existing.count + 1;
  const nextEntry = { count: nextCount, resetAt: existing.resetAt };
  store.set(key, nextEntry);

  return {
    allowed: nextCount <= RATE_LIMIT_MAX_REQUESTS,
    count: nextCount,
    resetAt: existing.resetAt,
  };
};

export const onRequest = defineMiddleware(async (context, next) => {
  // Prerendered routes run this at build time, where request headers don't exist.
  if (import.meta.env.DEV || context.isPrerendered) {
    return next();
  }

  const { request, url } = context;
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return next();
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  if (isBlockedAiCrawler(userAgent)) {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  if (!shouldRateLimitPath(url.pathname)) {
    return next();
  }

  const now = Date.now();
  const ip = getClientIp(request);
  const rateLimitKey = `rl:page:${ip}`;
  const result = applyRateLimit(rateLimitKey, now);

  if (!result.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAt - now) / 1000),
    );

    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    });
  }

  return next();
});
