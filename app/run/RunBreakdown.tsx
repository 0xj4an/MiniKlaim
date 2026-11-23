"use client";

import { type TranslationKey, useLocale } from "@/lib/i18n";
import { HEX_COLORS, LEVEL_DARK } from "@/lib/map/hexColors";
import { type LevelRange, levelRangeLabel } from "@/lib/runs/levelRange";

/** The burst's color for a block taken from someone (CaptureBursts). */
const STOLEN = "#be185d";

type Row = {
  key: string;
  n: number;
  color: string;
  label: string;
  note?: string;
};

/**
 * What a finished run did, as two sums that each add up.
 *
 * Under the sheet's headline, "12 blocks captured", come the two kinds of
 * captured block: the ones nobody held and the ones taken from another
 * player. Then a second section with its own total, "5 reinforcements and
 * attacks": the player's own blocks raised a level and other players'
 * blocks lowered one, with whose they are and the level they were left at.
 * That level is what tells the player whether a block falls on the next
 * pass.
 *
 * It was four lines under the one headline, and 9 + 3 + 2 + 3 is not 12:
 * reinforced and attacked blocks are not blocks gained, so listed with the
 * captured ones the count looked wrong (0xj4an, 23 Nov 2026). Before that
 * the sheet printed "Blocks: 3 stolen + 9 unclaimed" and two bare numbers.
 *
 * The first section's lines are whole phrases under a headline that
 * already says "captured". A line reading "captured" there would bring the
 * sum problem back, and "unclaimed" ("libres") was a word nobody could
 * place, which in English also collided with claiming blocks to the
 * wallet.
 *
 * The first section is silent when nothing was stolen: then every block
 * had no owner and the headline says all there is to say.
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
  const word = (key: TranslationKey, count: number) =>
    t(count === 1 ? (`${key}.one` as TranslationKey) : key);
  const now = (range?: LevelRange | null) =>
    range
      ? ` ${t("run.breakdown.nowLevel").replace("{l}", levelRangeLabel(range))}`
      : "";

  const free = Math.max(0, blocks - stolen);
  const captured: Row[] =
    stolen > 0
      ? [
          {
            key: "free",
            n: free,
            color: HEX_COLORS.run,
            label: word("run.breakdown.free", free),
          },
          {
            key: "stolen",
            n: stolen,
            color: STOLEN,
            label: word("run.breakdown.stolen", stolen),
          },
        ].filter((row) => row.n > 0)
      : [];
  const levels: Row[] = [
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
  if (captured.length === 0 && levels.length === 0) return null;

  // The second section's title names only what happened, so a run with
  // nothing but reinforces does not read "reinforcements and attacks".
  const levelsTitle =
    reinforced > 0 && attacked > 0
      ? t("run.breakdown.levels")
      : reinforced > 0
        ? word("run.breakdown.levels.reinforced", reinforced)
        : word("run.breakdown.levels.attacked", attacked);

  return (
    <>
      {captured.length > 0 && <Rows rows={captured} className="mt-3" />}
      {levels.length > 0 && (
        <div className="mt-4">
          <p className="flex items-baseline gap-2 text-zinc-900">
            <span className="mk-num text-[2rem] leading-none">
              {reinforced + attacked}
            </span>
            <span className="mk-title text-xl">{levelsTitle}</span>
          </p>
          <Rows rows={levels} className="mt-2" />
        </div>
      )}
    </>
  );
}

function Rows({ rows, className }: { rows: Row[]; className: string }) {
  return (
    <ul className={`border-t border-zinc-200 ${className}`}>
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
          <span className="min-w-0 flex-1 self-center">
            <span className="block text-[15px] leading-tight font-semibold text-zinc-900">
              {row.label}
            </span>
            {row.note && (
              <span className="mt-0.5 block text-[13px] leading-tight text-zinc-600">
                {row.note}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
