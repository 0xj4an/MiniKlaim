"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { isTreasuresEnabled } from "@/lib/drops/config";
import { useLocale } from "@/lib/i18n";

type Heat = { level: 0 | 1 | 2 | 3; label?: string | null; clue?: string | null };

const POLL_MS = 15_000;
const STYLE: Record<1 | 2 | 3, string> = {
  1: "border-sky-300 bg-sky-50 text-sky-900",
  2: "border-amber-300 bg-amber-50 text-amber-900",
  3: "border-red-300 bg-red-50 text-red-900",
};
const ICON: Record<1 | 2 | 3, string> = { 1: "🧊", 2: "🌡️", 3: "🔥" };

/**
 * Hot/cold chip during a run: how close the nearest open treasure is, as a
 * level. The phone sends its current cell so re-walking blocks already sent
 * still moves the signal; the server only uses it near the run's last
 * accepted block. The phone never learns where the treasure is.
 */
export function TreasureHeat({
  runId,
  currentCell,
}: {
  runId: string | null;
  /** The phone's current res-12 cell, read at each poll. */
  currentCell: () => string | null;
}) {
  const { t } = useLocale();
  const [heat, setHeat] = useState<Heat>({ level: 0 });

  useEffect(() => {
    if (!runId || !isTreasuresEnabled()) return;
    let cancelled = false;
    let last = 0;
    const poll = async () => {
      try {
        const cell = currentCell();
        const res = await fetch(
          `/api/drops/heat?runId=${runId}${cell ? `&at=${cell}` : ""}`,
          { cache: "no-store" },
        );
        const body = (await res.json()) as Heat;
        if (cancelled) return;
        setHeat(body);
        if (body.level > last) track("drop_heat", { level: body.level });
        last = body.level;
      } catch {
        // Keep the last level; the next poll retries.
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      setHeat({ level: 0 });
    };
    // currentCell reads a ref; it does not need to restart the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  if (!runId || heat.level === 0) return null;
  const level = heat.level;
  return (
    <div
      role="status"
      className={`absolute top-28 left-1/2 z-20 max-w-[90%] -translate-x-1/2 rounded-full border px-4 py-1.5 text-center text-xs font-semibold shadow ${STYLE[level]}`}
    >
      {ICON[level]} {t(`treasure.heat.${level}`)}
      {heat.label ? ` · ${heat.label}` : ""}
      {level >= 2 && heat.clue ? <span className="block font-normal">{heat.clue}</span> : null}
    </div>
  );
}
