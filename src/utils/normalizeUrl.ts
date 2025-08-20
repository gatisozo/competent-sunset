// src/utils/normalizeUrl.ts
export function normalizeUrl(input: string): string {
  let s = (input ?? "").trim();
  if (!s) return s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol))
      throw new Error("bad protocol");
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}
