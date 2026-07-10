/** '2026-07-08' → '2026.7.8' (신뢰 표시줄의 확인일 포맷) */
export function formatDateDot(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return `${y}.${m}.${d}`;
}

export { formatWon } from "@/lib/reco/cost";
