"use client";

import type { CSSProperties } from "react";
import { useLocale } from "@/lib/i18n";
import { HEX_COLORS } from "@/lib/map/hexColors";

/**
 * One thing that just happened to the player's blocks: blocks captured,
 * blocks reinforced, blocks attacked.
 */
export type CaptureBurst = {
  id: number;
  kind: "new" | "reinforced" | "attacked";
  count: number;
  /** Highest block level reached by a reinforce in this answer, if known. */
  level?: number;
  /**
   * The answer carried a queue (it followed a failed upload, or brought more
   * blocks than one step can). Captioned, so a jump from "+1" to "+20" says
   * what it is.
   */
  late?: boolean;
};

// The same meaning as on the map (lib/map/hexColors.ts): red is a capture,
// green a reinforce. Red is a shade darker than the map's fill so the number
// holds up as text inside its white rim.
const COLOR: Record<CaptureBurst["kind"], string> = {
  new: "#dc2626",
  reinforced: HEX_COLORS.reinforced,
  attacked: "#18181b",
};

/**
 * A number that pops over the map and is gone in a second.
 *
 * The counters in the banner tell the player the total. They do not tell
 * the player that the step they just took did something, and a reinforce
 * in particular changed a number nobody was looking at. Each answer from
 * the server now throws one number per kind of action it carried: "+3" for
 * new blocks, "+1" for a reinforce with the level it reached, "-2" for
 * attacks, each a level taken off someone else's block.
 *
 * Nothing here stays on screen or takes a tap: it sits over the map with
 * pointer events off and removes itself.
 *
 * Decorative for assistive tech: the capture line is the status region,
 * and announcing both would say everything twice.
 */
export function CaptureBursts({ bursts }: { bursts: CaptureBurst[] }) {
  const { t } = useLocale();
  if (bursts.length === 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-[34%] z-30 h-0"
    >
      {bursts.map((b) => {
        // One lane per kind, so the numbers from a single answer land side
        // by side instead of on top of each other.
        const slot = b.kind === "attacked" ? -1 : b.kind === "new" ? 0 : 1;
        const style = {
          "--dx": `${slot * 104}px`,
          "--rot": `${slot * 5}deg`,
          "--c": COLOR[b.kind],
          color: COLOR[b.kind],
        } as CSSProperties;
        const caption =
          b.kind === "reinforced"
            ? b.level
              ? t("run.burst.level").replace("{l}", String(b.level))
              : t("run.burst.reinforced")
            : b.kind === "attacked"
              ? t("run.burst.attacked")
              : b.late
                ? t("run.burst.saved")
                : null;
        return (
          <div key={b.id} className="capture-burst" style={style}>
            <span className="capture-burst-ring" />
            <span className="capture-burst-number">
              {b.kind === "attacked" ? "-" : "+"}
              {b.count}
            </span>
            {caption && (
              <span className="capture-burst-caption">{caption}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
