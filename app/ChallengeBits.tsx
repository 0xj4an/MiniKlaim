"use client";

import { useEffect, useRef, useState } from "react";
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

/** One short buzz where the platform allows it (Android); silent elsewhere. */
export function buzz(ms = 30) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // not supported
  }
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
        className="sheet-fade absolute inset-0 bg-violet-950/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="sheet-up relative mx-auto max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-4 pt-2 pb-8 shadow-2xl"
      >
        <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-white px-2 pb-1">
          <span className="w-11" />
          <span className="h-1.5 w-11 rounded-full bg-violet-200" />
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-11 w-11 items-center justify-center rounded-full text-violet-700"
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

/** Days, hours and minutes left, as separate blocks. Null when time is up. */
export function CountdownBlocks({
  msLeft,
  label,
  units,
}: {
  msLeft: number;
  label: string;
  units: { d: string; h: string; m: string };
}) {
  if (msLeft <= 0) return null;
  const totalMin = Math.floor(msLeft / 60_000);
  const parts = [
    { v: Math.floor(totalMin / 1440), l: units.d },
    { v: Math.floor((totalMin % 1440) / 60), l: units.h },
    { v: totalMin % 60, l: units.m },
  ];
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-xs font-medium text-violet-700">{label}</p>
      <div className="flex gap-1.5" role="timer" aria-label={label}>
        {parts.map((p) => (
          <div
            key={p.l}
            className="min-w-14 rounded-xl bg-violet-100 px-2 py-1 text-center"
          >
            <p className="text-xl leading-none font-black text-violet-950 tabular-nums">
              {String(p.v).padStart(2, "0")}
            </p>
            <p className="text-[11px] text-violet-700">{p.l}</p>
          </div>
        ))}
      </div>
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

/** The pot as a jar of coins: one coin per entrant (up to 40 drawn). */
export function CoinJar({
  coins,
  amount,
  caption,
}: {
  coins: number;
  amount: string;
  caption: string;
}) {
  const shown = Math.min(coins, 40);
  return (
    <div className="flex flex-col items-center">
      <p className="text-4xl leading-none font-black text-amber-600">
        {amount}
      </p>
      <div className="relative mt-2 h-16 w-44 overflow-hidden rounded-b-[2rem] border-[3px] border-t-0 border-violet-300 bg-violet-50">
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap-reverse justify-center gap-0.5 p-1.5">
          {Array.from({ length: shown }, (_, i) => (
            <span
              key={i}
              className="coin-drop h-[18px] w-[18px] rounded-full bg-amber-400 shadow-[inset_0_-3px_0_#b45309]"
              style={{ animationDelay: `${Math.min(i, 20) * 0.03}s` }}
            />
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs font-semibold text-violet-800">{caption}</p>
    </div>
  );
}

export type HexMissionData = {
  id: number;
  name: string;
  status: "held" | "claim" | "missing";
  /** 0..1 */
  fraction: number;
  short: string;
};

// Flat-top honeycomb: column step is 3/4 of a hex width, row step half its
// height. Slots (col, row): top, middle pair, bottom, then a lower pair.
const HEX_W = 6.2; // rem
const HEX_H = 5.4; // rem
const HEX_GAP = 1.05;
const HEX_SLOTS: [number, number][] = [
  [1, 0],
  [0, 0.5],
  [2, 0.5],
  [1, 1],
  [0, 1.5],
  [2, 1.5],
];

/**
 * The challenge badges as hexes, like the blocks on the map, filling from the
 * bottom with progress. Tapping one selects it; the card shows its hint.
 */
export function HexMissions({
  items,
  selected,
  onSelect,
}: {
  items: HexMissionData[];
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const shown = items.slice(0, HEX_SLOTS.length);
  const rows = Math.max(...shown.map((_, i) => HEX_SLOTS[i][1]), 0);
  return (
    <div
      className="relative mx-auto"
      style={{
        width: `${(HEX_W * 0.75 * 2 + HEX_W) * HEX_GAP}rem`,
        height: `${(rows + 1) * HEX_H * HEX_GAP}rem`,
      }}
    >
      {shown.map((m, i) => {
        const [col, row] = HEX_SLOTS[i];
        const pct = Math.round((m.status === "missing" ? m.fraction : 1) * 100);
        const fill =
          m.status === "held"
            ? "#10b981"
            : m.status === "claim"
              ? "#f59e0b"
              : "#7c3aed";
        const sel = selected === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            aria-pressed={sel}
            aria-label={`${m.name}: ${m.short}`}
            className="hex-cell absolute flex flex-col items-center justify-center gap-0.5 transition-transform duration-200"
            style={{
              width: `${HEX_W}rem`,
              height: `${HEX_H}rem`,
              left: `${col * HEX_W * 0.75 * HEX_GAP}rem`,
              top: `${row * HEX_H * HEX_GAP}rem`,
              background: `linear-gradient(0deg, ${fill} ${pct}%, #ede9fe ${pct}%)`,
              transform: `scale(${sel ? 1.07 : 0.97})`,
            }}
          >
            <span className="rounded-full bg-white/90 p-0.5">
              <BadgeArt id={m.id} unlocked={m.status !== "missing"} size={26} />
            </span>
            <span
              className={`text-[11px] leading-tight font-bold ${pct > 55 ? "text-white" : "text-violet-950"}`}
            >
              {m.short}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hold to confirm: the bar fills while the finger stays down and fires once
 * full. Enter or Space fire it at once for keyboards.
 */
export function HoldButton({
  label,
  holdingLabel,
  busyLabel,
  busy,
  disabled,
  onConfirm,
}: {
  label: string;
  holdingLabel: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const fired = useRef(false);
  const start = () => {
    if (busy || disabled) return;
    fired.current = false;
    setHolding(true);
  };
  const stop = () => setHolding(false);
  return (
    <button
      type="button"
      disabled={busy || disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !busy && !disabled) {
          e.preventDefault();
          onConfirm();
        }
      }}
      className="relative min-h-14 w-full touch-none overflow-hidden rounded-2xl bg-violet-800 text-lg font-black text-white select-none disabled:opacity-60"
    >
      <span
        className={`absolute inset-y-0 left-0 bg-amber-400 ${holding ? "hold-fill" : "w-0"}`}
        onAnimationEnd={() => {
          if (fired.current) return;
          fired.current = true;
          setHolding(false);
          buzz(40);
          onConfirm();
        }}
      />
      <span className={`relative ${holding ? "text-violet-950" : ""}`}>
        {busy ? busyLabel : holding ? holdingLabel : label}
      </span>
    </button>
  );
}

/** The player's entry as a ticket that tilts under the finger. */
export function TiltTicket({
  kicker,
  title,
  line,
}: {
  kicker: string;
  title: string;
  line: string;
}) {
  const [t, setT] = useState({ x: 0, y: 0 });
  const reset = () => setT({ x: 0, y: 0 });
  return (
    <div
      className="[perspective:700px]"
      style={{ touchAction: "pan-y" }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setT({
          x: ((e.clientY - r.top) / r.height - 0.5) * -14,
          y: ((e.clientX - r.left) / r.width - 0.5) * 20,
        });
      }}
      onPointerLeave={reset}
      onPointerUp={reset}
    >
      <div
        className="ticket-in relative flex overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-violet-800 to-amber-500 text-white shadow-lg transition-transform duration-75"
        style={{
          transform: `rotateX(${t.x.toFixed(1)}deg) rotateY(${t.y.toFixed(1)}deg)`,
        }}
      >
        <span
          aria-hidden
          className="ticket-shine pointer-events-none absolute inset-0"
        />
        <div className="relative flex min-w-0 flex-1 flex-col px-4 py-3">
          <p className="text-[11px] font-bold tracking-wide uppercase opacity-85">
            {kicker}
          </p>
          <p className="text-xl font-black">{title}</p>
          <p className="text-xs opacity-90">{line}</p>
        </div>
        <div className="relative flex w-16 items-center justify-center border-l-2 border-dashed border-white/60">
          <span aria-hidden className="text-3xl">
            🎟️
          </span>
        </div>
      </div>
    </div>
  );
}

/** Small honeycomb of four for the compact card: filled = mission done. */
export function MiniHexes({ done }: { done: boolean[] }) {
  const pos = [
    [14, 0],
    [0, 13],
    [28, 13],
    [14, 26],
  ];
  return (
    <span
      aria-hidden
      className="relative inline-block h-[50px] w-[52px] shrink-0"
    >
      {done.slice(0, 4).map((d, i) => (
        <span
          key={i}
          className={`hex-cell absolute h-[22px] w-[24px] ${d ? "bg-emerald-400" : "bg-white/35"}`}
          style={{ left: pos[i][0], top: pos[i][1] }}
        />
      ))}
    </span>
  );
}
