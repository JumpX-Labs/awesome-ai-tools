import pinyin from "pinyin-match";

export function textMatchesQuery(text: string, query: string): boolean {
  const t = query.trim().toLowerCase();
  if (!t) return true;
  const s = (text || "").toLowerCase();
  if (s.includes(t)) return true;
  try {
    return Boolean(pinyin.match(s, t));
  } catch {
    return false;
  }
}
