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
  // Each half takes its own word, so one block reads "1 robada" and not
  // "1 robadas": one stolen block is the commonest case there is.
  return t("run.tally.split")
    .replace("{f}", String(free))
    .replace("{fw}", t(free === 1 ? "run.tally.free.one" : "run.tally.free"))
    .replace("{s}", String(stolen))
    .replace(
      "{sw}",
      t(stolen === 1 ? "run.tally.stolen.one" : "run.tally.stolen"),
    );
}
