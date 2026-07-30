export const CONTACT_RECIPIENT = "hei@joacimeldre.com";
export const CONTACT_SUBJECT = "👋 hello through joacimeldre.com";

export function buildContactMailtoHref(body = ""): string {
  return `mailto:${CONTACT_RECIPIENT}?subject=${encodeURIComponent(CONTACT_SUBJECT)}&body=${encodeURIComponent(body)}`;
}
