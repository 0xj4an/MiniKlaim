import type { TranslationKey } from "@/lib/i18n";

/**
 * The line that says what a run's blocks were: how many were taken from
 * another player and how many nobody held.
 *
 * Both halves, always. The first version said only "40 stolen" under
 * "44 blocks", and the player asked the obvious question: and the other
 * four? (0xj4an, 15 Nov 2026.) A number that is part of a total has to come
 * with the rest of it, or the total looks wrong.
 *
 * Null when nothing was stolen: then no block had an owner and the
 * count already says all there is to say.
 */
export function stolenSplit(
  t: (key: TranslationKey) => string,
  blocks: number,
  stolen: number,
): string | null {
  if (stolen <= 0) return null;
  const free = Math.max(0, blocks - stolen);
  if (free === 0) {
    return t(
      stolen === 1 ? "run.tally.allStolen.one" : "run.tally.allStolen",
    ).replace("{n}", String(stolen));
  }
  return t("run.tally.split")
    .replace("{s}", String(stolen))
    .replace("{f}", String(free));
}
