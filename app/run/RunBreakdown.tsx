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
 * Every line is one line of text. As ruled rows with a sentence under each
 * they made the sheet taller than the phone (0xj4an, 23 Nov 2026).
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
  // Whose the blocks are and where their level went: to a level when the
  // phone saw it, by one level when it did not.
  const moved = (
    to: "run.breakdown.reinforcedTo" | "run.breakdown.attackedTo",
    by: "run.breakdown.reinforcedBy" | "run.breakdown.attackedBy",
    count: number,
    range?: LevelRange | null,
  ) =>
    range
      ? word(to, count).replace("{l}", levelRangeLabel(range))
      : word(by, count);

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
      note: moved(
        "run.breakdown.reinforcedTo",
        "run.breakdown.reinforcedBy",
        reinforced,
        reinforcedLevels,
      ),
    },
    {
      key: "attacked",
      n: attacked,
      color: LEVEL_DARK.others,
      label: word("run.tally.attacked", attacked),
      note: moved(
        "run.breakdown.attackedTo",
        "run.breakdown.attackedBy",
        attacked,
        attackedLevels,
      ),
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
      {captured.length > 0 && <Rows rows={captured} className="mt-1" />}
      {levels.length > 0 && (
        <div className="mt-2">
          <p className="flex items-baseline gap-1.5 text-zinc-900">
            <span className="mk-num text-[1.625rem] leading-none">
              {reinforced + attacked}
            </span>
            <span className="mk-title text-lg leading-none">{levelsTitle}</span>
          </p>
          <Rows rows={levels} className="mt-0.5" />
        </div>
      )}
    </>
  );
}

function Rows({ rows, className }: { rows: Row[]; className: string }) {
  return (
    <ul className={className}>
      {rows.map((row) => (
        <li key={row.key} className="flex items-baseline gap-2 py-[3px]">
          <svg
            aria-hidden
            width={11}
            height={11}
            viewBox="0 0 100 100"
            className="shrink-0"
          >
            <polygon
              points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5"
              fill={row.color}
            />
          </svg>
          <span className="min-w-0 flex-1 text-[15px] leading-snug text-zinc-900">
            <span className="mk-num mr-1.5 text-[1.1875rem] leading-none">
              {row.n}
            </span>
            <span className="font-semibold">{row.label}</span>
            {/* Lighter and smaller, so it reads on as one phrase: "2
                reforzadas tuyas, suben a nivel 3". */}
            {row.note && (
              <span className="text-[13px] text-zinc-600"> {row.note}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
