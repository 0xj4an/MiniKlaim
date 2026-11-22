/**
 * "2 d 4 h", "10 h 13 min", "12 min", "< 1 min" until a deadline. Coarse on
 * purpose: the card ticks once a minute, so seconds would only look stale.
 * Returns null once the deadline has passed.
 */
export function countdownLabel(msLeft: number): string | null {
  if (msLeft <= 0) return null;
  const totalMin = Math.floor(msLeft / 60_000);
  if (totalMin < 1) return "< 1 min";
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}
