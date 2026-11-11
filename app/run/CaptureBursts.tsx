"use client";

import { useLocale } from "@/lib/i18n";

/**
 * One thing that just happened to the player's blocks, to float up the
 * screen and fade: blocks captured, blocks reinforced, blocks attacked.
 */
export type CaptureBurst = {
  id: number;
  kind: "new" | "reinforced" | "attacked";
  count: number;
  /** Highest block level reached by a reinforce in this answer, if known. */
  level?: number;
};

/**
 * Floating "+1" feedback for the run screen.
 *
 * The counters in the banner tell the player the total. They do not tell
 * the player that the step they just took did something, and a reinforce
 * in particular changed a number nobody was looking at. Each answer from
 * the server now produces one chip per kind of action it carried.
 *
 * Purely decorative for assistive tech: the capture line below is the
 * status region, and announcing both would say everything twice.
 */
export function CaptureBursts({ bursts }: { bursts: CaptureBurst[] }) {
  const { t } = useLocale();
  if (bursts.length === 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-52 z-30 flex flex-col items-center gap-1.5"
    >
      {bursts.map((b) => {
        const one = b.count === 1;
        const text =
          b.kind === "new"
            ? t(one ? "run.burst.new.one" : "run.burst.new")
            : b.kind === "reinforced"
              ? t(one ? "run.burst.reinforced.one" : "run.burst.reinforced")
              : t(one ? "run.burst.attacked.one" : "run.burst.attacked");
        const tone =
          b.kind === "new"
            ? "bg-orange-600 text-white"
            : b.kind === "reinforced"
              ? "bg-emerald-600 text-white"
              : "bg-zinc-900 text-white";
        return (
          <div
            key={b.id}
            className={`capture-burst rounded-full px-4 py-1.5 text-base font-bold shadow-lg ${tone}`}
          >
            {text.replace("{n}", String(b.count))}
            {b.kind === "reinforced" && b.level ? (
              <span className="ml-1.5 text-xs font-semibold opacity-90">
                {t("run.burst.level").replace("{l}", String(b.level))}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
