"use client";

import { type TranslationKey, useLocale } from "@/lib/i18n";
import { HEX_COLORS, LEVEL_DARK } from "@/lib/map/hexColors";
import { type LevelRange, levelRangeLabel } from "@/lib/runs/levelRange";

/** The burst's color for a block taken from someone (CaptureBursts). */
const STOLEN = "#be185d";

/**
 * What a finished run did, one line per kind of thing and each said in
 * words: blocks nobody held, blocks taken from someone, the player's own
 * blocks raised a level, other players' blocks lowered a level.
 *
 * The sheet used to print "Blocks: 3 stolen + 9 unclaimed" and two bare
 * numbers, "2 reinforced" and "3 attacked". Nothing said whose blocks
 * those were, that a level had moved, or where it ended up, and the level
 * a block is left at is what tells the player whether it falls on the next
 * pass (0xj4an, 23 Nov 2026: show all of it, and show it well).
 *
 * The first two lines add up to the headline count and the last two do
 * not, so each line says whose the blocks are now. See stolenSplit for why
 * both halves of the count are always printed together.
 *
 * Nothing when the run only took unclaimed blocks: the headline already
 * says all there is to say.
 */
export function RunBreakdown({
  blocks,
  stolen,
  reinforced,
  attacked,
  reinforcedLevels,
  attackedLevels,
}: {
  /** New blocks this run, stolen ones included. */
  blocks: number;
  stolen: number;
  reinforced: number;
  attacked: number;
  reinforcedLevels?: LevelRange | null;
  attackedLevels?: LevelRange | null;
}) {
  const { t } = useLocale();
  if (stolen <= 0 && reinforced <= 0 && attacked <= 0) return null;

  const word = (key: TranslationKey, count: number) =>
    t(count === 1 ? (`${key}.one` as TranslationKey) : key);
  const now = (range?: LevelRange | null) =>
    range
      ? ` ${t("run.breakdown.nowLevel").replace("{l}", levelRangeLabel(range))}`
      : "";

  const free = Math.max(0, blocks - stolen);
  const rows = [
    {
      key: "free",
      n: free,
      color: HEX_COLORS.run,
      label: word("run.breakdown.free", free),
      note: word("run.breakdown.freeNote", free),
    },
    {
      key: "stolen",
      n: stolen,
      color: STOLEN,
      label: word("run.breakdown.stolen", stolen),
      note: word("run.breakdown.stolenNote", stolen),
    },
    {
      key: "reinforced",
      n: reinforced,
      color: HEX_COLORS.reinforced,
      label: word("run.tally.reinforced", reinforced),
      note:
        word("run.breakdown.reinforcedNote", reinforced) +
        now(reinforcedLevels),
    },
    {
      key: "attacked",
      n: attacked,
      color: LEVEL_DARK.others,
      label: word("run.tally.attacked", attacked),
      note: word("run.breakdown.attackedNote", attacked) + now(attackedLevels),
    },
  ].filter((row) => row.n > 0);

  return (
    <ul className="mt-3 border-t border-zinc-200">
      {rows.map((row) => (
        <li
          key={row.key}
          className="flex items-start gap-2.5 border-b border-zinc-200 py-2"
        >
          <svg
            aria-hidden
            width={14}
            height={14}
            viewBox="0 0 100 100"
            className="mt-1.5 shrink-0"
          >
            <polygon
              points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5"
              fill={row.color}
            />
          </svg>
          <span className="mk-num min-w-7 text-[1.625rem] leading-none text-zinc-900">
            {row.n}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-tight font-semibold text-zinc-900">
              {row.label}
            </span>
            <span className="mt-0.5 block text-[13px] leading-tight text-zinc-600">
              {row.note}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
