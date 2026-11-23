"use client";

import { useEffect, useState } from "react";
import { BadgeArt } from "@/app/BadgeGroups";

/**
 * Game-style pieces of the weekly challenge: the sheet it opens in, the gift
 * that reveals last week's result, the coin jar, the hex missions, the
 * hold-to-enter button and the ticket. Presentation only; the card decides
 * what is true. CSS and pointer events only (no animation library), and every
 * animation is off under prefers-reduced-motion (app/globals.css).
 */

const REVEAL_KEY = (id: string) => `miniklaim.challengeReveal.${id}`;

function readSeen(id: string): boolean {
  try {
    return localStorage.getItem(REVEAL_KEY(id)) === "1";
  } catch {
    return false;
  }
}

/** Whether this player already opened the gift for challenge `id`. */
export function useRevealed(id: string | null): [boolean, () => void] {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    // localStorage is read after mount so the server render matches.
    if (id) setSeen(readSeen(id));
  }, [id]);
  const open = () => {
    if (!id) return;
    try {
      localStorage.setItem(REVEAL_KEY(id), "1");
    } catch {
      // private mode: the gift just shows again next time
    }
    setSeen(true);
  };
  return [seen, open];
}

/** Full-screen sheet that slides up from the bottom. */
export function Sheet({
  open,
  onClose,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="sheet-fade absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="sheet-up relative mx-auto max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white px-5 pt-2 pb-8 shadow-2xl"
      >
        <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-white px-2 pb-1">
          <span className="w-11" />
          <span className="h-1.5 w-11 rounded-full bg-zinc-300" />
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-600"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The sealed gift. Tapping it reveals the result. */
export function Chest({
  label,
  onOpen,
}: {
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="flex flex-col items-center gap-1 rounded-xl px-6 py-2"
    >
      <span aria-hidden className="chest-wobble text-7xl leading-none">
        🎁
      </span>
      <span className="text-sm font-semibold text-violet-800">{label}</span>
    </button>
  );
}

const CONFETTI = ["#7c3aed", "#10b981", "#f59e0b", "#ec4899", "#3b82f6"];

/** A short burst of confetti over the parent (which must be `relative`). */
export function Confetti() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {Array.from({ length: 18 }, (_, i) => (
        <i
          key={i}
          className="confetti-bit"
          style={{
            left: `${(i * 37 + 5) % 96}%`,
            background: CONFETTI[i % CONFETTI.length],
            animationDelay: `${(i % 6) * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Short "6 d 21 h" for the compact card. */
export function shortLeft(msLeft: number): string | null {
  if (msLeft <= 0) return null;
  const totalMin = Math.floor(msLeft / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return d > 0 ? `${d} d ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export type HexMissionData = {
  id: number;
  name: string;
  status: "held" | "claim" | "missing";
  /** 0..1 */
  fraction: number;
  short: string;
};

/**
 * The challenge badges as rows, drawn like the badge groups on the profile
 * (art, name, bar), because a mission is a badge.
 */
export function MissionRows({
  items,
  claimLabel,
}: {
  items: HexMissionData[];
  claimLabel: string;
}) {
  return (
    <ul className="rounded-lg border border-zinc-200 px-3.5">
      {items.map((m) => {
        const pct = Math.round(
          (m.status === "missing" ? Math.max(0, Math.min(1, m.fraction)) : 1) *
            100,
        );
        return (
          <li
            key={m.id}
            className="flex items-center gap-3 border-t border-zinc-100 py-2.5 first:border-t-0"
          >
            <BadgeArt id={m.id} unlocked={m.status !== "missing"} size={34} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-bold tracking-wide text-zinc-900 uppercase">
                  {m.name}
                </span>
                {m.status === "claim" ? (
                  <a
                    href="/me"
                    className="shrink-0 text-xs font-semibold text-violet-700 underline"
                  >
                    {claimLabel}
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-zinc-600 tabular-nums">
                    {m.short}
                  </span>
                )}
              </span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-zinc-200">
                <span
                  className={`block h-full rounded-full ${
                    m.status === "held"
                      ? "bg-emerald-500"
                      : m.status === "claim"
                        ? "bg-amber-500"
                        : "bg-violet-600"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
