/** Use only navigable web URLs; legacy unsafe catalogue values are not rendered. */
export function safeResourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || Array.from(url).some(character => character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}
