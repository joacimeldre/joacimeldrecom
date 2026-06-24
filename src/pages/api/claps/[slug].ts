import { createClient } from "redis";
import type { APIRoute } from "astro";

export const prerender = false;

const isDev = import.meta.env.DEV;
const hasRedisConfig = Boolean(process.env.REDIS_URL);

let redisClient: ReturnType<typeof createClient> | null = null;

const getRedisClient = async () => {
  if (!hasRedisConfig) return null;
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (err) => console.error("Redis client error:", err));
  }
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  return redisClient;
};

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 5;
const RECLAP_WINDOW_SECONDS = 60 * 60 * 12;

type MemoryEntry = {
  value: string;
  expiresAt: number | null;
};

const getMemoryStore = () => {
  const globalKey = "__clapMemoryStore";
  const globalObj = globalThis as Record<string, unknown>;

  if (!(globalObj[globalKey] instanceof Map)) {
    globalObj[globalKey] = new Map<string, MemoryEntry>();
  }

  return globalObj[globalKey] as Map<string, MemoryEntry>;
};

const memoryGet = async (key: string) => {
  const store = getMemoryStore();
  const entry = store.get(key);

  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return entry.value;
};

const memorySet = async (key: string, value: string, exSeconds?: number) => {
  const expiresAt = exSeconds ? Date.now() + exSeconds * 1000 : null;
  getMemoryStore().set(key, { value, expiresAt });
};

const memoryIncr = async (key: string) => {
  const current = parseCount(await memoryGet(key));
  const next = current + 1;
  await memorySet(key, String(next));
  return next;
};

const memoryExpire = async (key: string, seconds: number) => {
  const current = await memoryGet(key);
  if (current === null) return;
  await memorySet(key, String(current), seconds);
};

const withRedisFallback = async <T>(
  operation: (
    client: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>,
  ) => Promise<T>,
  fallback: () => Promise<T>,
) => {
  const client = await getRedisClient();
  if (!client) return fallback();
  try {
    return await operation(client);
  } catch (error) {
    console.error(
      "Redis operation failed, falling back to memory store:",
      error,
    );
    return fallback();
  }
};

const storeGet = (key: string) =>
  withRedisFallback(
    (client) => client.get(key),
    () => memoryGet(key),
  );
const storeSet = (key: string, value: string, exSeconds?: number) =>
  withRedisFallback(
    (client) =>
      client.set(key, value, exSeconds ? { EX: exSeconds } : undefined),
    () => memorySet(key, value, exSeconds),
  );
const storeIncr = (key: string) =>
  withRedisFallback(
    (client) => client.incr(key),
    () => memoryIncr(key),
  );
const storeExpire = (key: string, seconds: number) =>
  withRedisFallback(
    (client) => client.expire(key, seconds),
    () => memoryExpire(key, seconds),
  );

const getClientId = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown-ip";
  const userAgent = request.headers.get("user-agent") ?? "unknown-ua";
  return `${ip}:${userAgent.slice(0, 80)}`;
};

const parseCount = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug } = params;
    if (!slug) {
      return new Response(JSON.stringify({ error: "Missing slug" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clapKey = `claps:${slug}`;
    const count = parseCount(await storeGet(clapKey));

    return new Response(JSON.stringify({ count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching claps:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch claps" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;
    if (!slug) {
      return new Response(JSON.stringify({ error: "Missing slug" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!isDev) {
      const clientId = getClientId(request);
      const rateLimitKey = `claps:rl:${slug}:${clientId}`;
      const rateLimitCount = parseCount(await storeIncr(rateLimitKey));

      if (rateLimitCount === 1) {
        await storeExpire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
      }

      if (rateLimitCount > RATE_LIMIT_MAX_REQUESTS) {
        return new Response(
          JSON.stringify({
            error: "Too many clap attempts. Please try again soon.",
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const recLapKey = `claps:reclap:${slug}:${clientId}`;
      const hasRecentClap = (await storeGet(recLapKey)) === "1";
      if (hasRecentClap) {
        const currentCount = parseCount(await storeGet(`claps:${slug}`));
        return new Response(
          JSON.stringify({
            count: currentCount,
            blocked: true,
            reason: "already-clapped-recently",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      await storeSet(recLapKey, "1", RECLAP_WINDOW_SECONDS);
    }

    const clapKey = `claps:${slug}`;
    const count = parseCount(await storeIncr(clapKey));

    return new Response(JSON.stringify({ count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error incrementing claps:", error);
    return new Response(
      JSON.stringify({ error: "Failed to increment claps" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
