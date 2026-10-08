/** Accept exact counts only: digits or consistently grouped thousands. */
export function parseExactApplicationCount(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:[ \u00a0]\d{3})+)$/.test(text)) return null;
  const count = Number(text.replace(/[., \u00a0]/g, ""));
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}
