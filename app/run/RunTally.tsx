"use client";

import { type TranslationKey, useLocale } from "@/lib/i18n";
import { HEX_COLORS, LEVEL_DARK } from "@/lib/map/hexColors";

/**
 * A run's numbers as one compact row: blocks, reinforces, attacks.
 *
 * Each number has the small hexagon of its color on the map (red for a
 * capture, green for a reinforce, dark gray for another player's block), so
 * the row doubles as the legend for what the player is looking at. The
 * numbers themselves stay in the app's own ink: an earlier pass colored the
 * text per action and it stopped looking like MiniKlaim.
 *
 * Stolen blocks are some of the blocks, not a fourth total, so they are
 * never a number in this row: the caller prints them as a note about the
 * block count. Before this, "44 blocks" sat next to "40 stolen" and read as
 * two numbers to add.
 *
 * The small size is one line of text, the height of the line it replaced.
 */
export function RunTally({
  blocks,
  reinforced,
  attacked,
  size = "sm",
  showBlocks = true,
}: {
  /** New blocks this run, stolen ones included. */
  blocks: number;
  reinforced: number;
  attacked: number;
  size?: "sm" | "md";
  /**
   * Whether the block count is a column here. The finished-run card shows
   * it as its headline already.
   */
  showBlocks?: boolean;
}) {
  const { t } = useLocale();
  const word = (key: TranslationKey, count: number) =>
    t(count === 1 ? (`${key}.one` as TranslationKey) : key);

  const stats: Stat[] = [
    ...(showBlocks
      ? [
          {
            key: "blocks",
            n: blocks,
            label: word("run.tally.blocks", blocks),
            color: HEX_COLORS.run,
          },
        ]
      : []),
    ...(reinforced > 0
      ? [
          {
            key: "reinforced",
            n: reinforced,
            label: word("run.tally.reinforced", reinforced),
            color: HEX_COLORS.reinforced,
          },
        ]
      : []),
    ...(attacked > 0
      ? [
          {
            key: "attacked",
            n: attacked,
            label: word("run.tally.attacked", attacked),
            color: LEVEL_DARK.others,
          },
        ]
      : []),
  ];
  if (stats.length === 0) return null;

  const md = size === "md";
  if (!md) {
    // One line of text, the height of the line this replaced: on the run
    // screen the map is the game and every row here is a row of map lost.
    return (
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3.5 text-[13px] leading-tight text-zinc-500">
        {stats.map((s) => (
          <span key={s.key} className="flex items-center gap-1 whitespace-nowrap">
            <Hexagon color={s.color} size={9} />
            <span className="mk-num text-[17px] leading-none text-zinc-900">
              {s.n}
            </span>
            {s.label}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-start justify-center gap-6">
      {stats.map((s) => (
        <div key={s.key} className="flex flex-col">
          <span className="flex items-center gap-1.5">
            <Hexagon color={s.color} size={13} />
            <span className="mk-num text-[1.75rem] leading-none text-zinc-900">
              {s.n}
            </span>
          </span>
          <span className="mt-1 text-[13px] leading-none text-zinc-600">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

type Stat = {
  key: string;
  n: number;
  label: string;
  color: string;
};

/** The block shape, as on the map and in the logo. */
function Hexagon({ color, size }: { color: string; size: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 100 100">
      <polygon
        points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5"
        fill={color}
      />
    </svg>
  );
}
