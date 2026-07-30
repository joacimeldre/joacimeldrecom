export const CONTACT_RECIPIENT = "hei@joacimeldre.com";
export const CONTACT_SUBJECT = "👋 hello through joacimeldre.com";

export function buildContactMailtoHref(body?: string): string {
  const queryParts = [`subject=${encodeURIComponent(CONTACT_SUBJECT)}`];

  if (typeof body === "string" && body.trim().length > 0) {
    queryParts.push(`body=${encodeURIComponent(body)}`);
  }

  return `mailto:${CONTACT_RECIPIENT}?${queryParts.join("&")}`;
}
