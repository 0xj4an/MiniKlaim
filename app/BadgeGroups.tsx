"use client";

import { useState } from "react";
import { badgeSvg } from "@/lib/onchain/badgeArt";
import { BADGE_GROUPS, type EvaluatedBadge } from "@/lib/onchain/badgeCatalog";

const COPY = {
  en: { level: "Level", of: "of", next: "Next:", done: "All earned" },
  es: { level: "Nivel", of: "de", next: "Siguiente:", done: "Completo" },
} as const;

function BadgeArt({
  id,
  unlocked,
  size = 28,
}: {
  id: number;
  unlocked: boolean;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${unlocked ? "" : "opacity-40 grayscale"}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: badgeSvg(id, size) }}
    />
  );
}

/**
 * Badges grouped by category, one row per group: the highest badge earned,
 * the level reached (badges earned in the group), and the next goal. Tap a
 * group to see every badge in it. Used on /me and on public profiles.
 */
export function BadgeGroups({
  badges,
  locale,
}: {
  badges: EvaluatedBadge[];
  locale: "en" | "es";
}) {
  const copy = COPY[locale];
  const byId = new Map(badges.map((b) => [b.onchainId, b]));
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex flex-col divide-y divide-zinc-200">
      {BADGE_GROUPS.map((group) => {
        const items = group.ids
          .map((id) => byId.get(id))
          .filter((b): b is EvaluatedBadge => !!b);
        if (items.length === 0) return null;
        const earned = items.filter((b) => b.unlocked);
        const top = earned[earned.length - 1] ?? null;
        const nextGoal = items.find((b) => !b.unlocked) ?? null;
        const isOpen = open.has(group.en);
        const pct = Math.round((earned.length / items.length) * 100);
        const name = locale === "es" ? group.es : group.en;
        return (
          <div key={group.en} className="py-2 first:pt-0 last:pb-0">
            <button
              type="button"
              onClick={() => toggle(group.en)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 text-left"
            >
              <BadgeArt
                id={(top ?? items[0]).onchainId}
                unlocked={!!top}
                size={36}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold tracking-wide text-zinc-700 uppercase">
                    {name}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">
                    {copy.level} {earned.length} {copy.of} {items.length}
                  </span>
                </span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                  <span
                    className="block h-full rounded-full bg-orange-500"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="truncate text-[11px] text-zinc-500">
                  {top ? (
                    <span className="font-semibold text-zinc-800">
                      {top.name}
                    </span>
                  ) : null}
                  {top && nextGoal ? " · " : null}
                  {nextGoal
                    ? `${copy.next} ${nextGoal.description}`
                    : copy.done}
                </span>
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
                className={`shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {isOpen && (
              <div className="mt-2 flex flex-col gap-1 pl-2">
                {items.map((b) => (
                  <div
                    key={b.onchainId}
                    className={`flex items-center justify-between gap-3 ${b.unlocked ? "text-zinc-900" : "text-zinc-500"}`}
                  >
                    <span className="flex items-center gap-2">
                      <BadgeArt id={b.onchainId} unlocked={b.unlocked} />
                      <span className={b.unlocked ? "font-semibold" : ""}>
                        {b.name}
                      </span>
                    </span>
                    <span className="text-right text-xs text-zinc-500">
                      {b.description}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
