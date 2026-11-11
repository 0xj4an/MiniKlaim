"use client";

import { useEffect, useState } from "react";
import { CloseButton } from "@/app/CloseButton";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { HEX_COLORS, LEVEL_DARK } from "@/lib/map/hexColors";
import { TOP_COLORS } from "@/lib/map/topColors";

const SEEN_KEY = "run_legend_seen";

/**
 * What the colors on the run map mean, and the four rules behind them.
 *
 * The map carried five visual states (yours, this run's, someone else's,
 * a darker shade per level, and the rim on blocks spent today) and nothing
 * on screen said what any of them were. A player found out a block was
 * spent by walking onto it.
 *
 * Opens by itself once, for players who already finished the first-visit
 * tips, so the two never stack. After that it lives behind the "?" button.
 */
export function MapLegend({ strength }: { strength: boolean }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (
        localStorage.getItem("onboarding_seen") &&
        !localStorage.getItem(SEEN_KEY)
      ) {
        setOpen(true);
        track("run_legend_opened", { auto: true });
      }
    } catch {
      // Private mode: the button still works.
    }
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing to remember it in; it will open again next visit.
    }
  };

  const swatch = (color: string, extra = "") => (
    <span
      aria-hidden
      className={`inline-block h-5 w-5 shrink-0 rounded-md border border-black/10 ${extra}`}
      style={{ backgroundColor: color }}
    />
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          track("run_legend_opened", { auto: false });
        }}
        aria-label={t("run.legend.open")}
        className="absolute top-1/3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-lg font-bold text-zinc-800 shadow-md"
      >
        ?
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("run.legend.title")}
          className="absolute inset-0 z-40 flex items-end justify-center bg-black/40"
          onClick={close}
        >
          <div
            className="max-h-[85%] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-white px-5 pt-5 pb-6 shadow-xl"
            style={{
              paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight text-zinc-900">
                {t("run.legend.title")}
              </h2>
              <CloseButton onClick={close} className="h-7 w-7 shrink-0" />
            </div>

            <ul className="mt-4 space-y-3 text-[13px] leading-snug text-zinc-700">
              <li className="flex items-center gap-3">
                {swatch(HEX_COLORS.run)}
                <span>{t("run.legend.run")}</span>
              </li>
              <li className="flex items-center gap-3">
                {swatch(HEX_COLORS.mine)}
                <span>{t("run.legend.mine")}</span>
              </li>
              <li className="flex items-center gap-3">
                {swatch(HEX_COLORS.others)}
                <span>{t("run.legend.others")}</span>
              </li>
              <li>
                <span className="flex flex-wrap gap-1" aria-hidden>
                  {TOP_COLORS.map((color, i) => (
                    <span
                      key={color}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {i + 1}
                    </span>
                  ))}
                </span>
                <span className="mt-1.5 block">{t("run.legend.top")}</span>
              </li>
              {strength && (
                <>
                  <li className="flex items-center gap-3">
                    <span className="flex shrink-0 gap-0.5" aria-hidden>
                      {swatch(HEX_COLORS.mine, "!h-5 !w-2.5")}
                      {swatch(LEVEL_DARK.mine, "!h-5 !w-2.5")}
                    </span>
                    <span>{t("run.legend.level")}</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="inline-block h-5 w-5 shrink-0 rounded-md border-2 border-dashed border-zinc-500 bg-zinc-200"
                    />
                    <span>{t("run.legend.used")}</span>
                  </li>
                </>
              )}
            </ul>

            <h3 className="mt-5 text-sm font-semibold text-zinc-900">
              {t("run.legend.rules")}
            </h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-snug text-zinc-700">
              <li>{t("run.legend.rule.move")}</li>
              {strength && (
                <>
                  <li>{t("run.legend.rule.reinforce")}</li>
                  <li>{t("run.legend.rule.attack")}</li>
                  <li>{t("run.legend.rule.daily")}</li>
                </>
              )}
              <li>{t("run.legend.rule.gps")}</li>
            </ol>

            <button
              type="button"
              onClick={close}
              className="mt-5 w-full rounded-full bg-orange-700 py-3 text-sm font-semibold text-white"
            >
              {t("run.legend.ok")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
