"use client";

import { useEffect, useState } from "react";
import { BadgeArt } from "@/app/BadgeGroups";

/**
 * Game-style pieces of the weekly challenge card: the chest that reveals last
 * week's result, the countdown blocks, the mission tiles and the entry
 * ticket. Presentation only; the card decides what is true.
 */

const REVEAL_KEY = (id: string) => `miniklaim.challengeReveal.${id}`;

function readSeen(id: string): boolean {
  try {
    return localStorage.getItem(REVEAL_KEY(id)) === "1";
  } catch {
    return false;
  }
}

/** Whether this player already opened the chest for challenge `id`. */
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
      // private mode: the chest just shows again next time
    }
    setSeen(true);
  };
  return [seen, open];
}

/** The sealed chest. Tapping it reveals the result below it. */
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
      className="chest-wobble flex flex-col items-center gap-1 rounded-xl px-6 py-2"
    >
      <span aria-hidden className="text-6xl leading-none">
        🎁
      </span>
      <span className="text-sm font-semibold text-violet-800">{label}</span>
    </button>
  );
}

const CONFETTI = ["#7c3aed", "#10b981", "#f59e0b", "#ec4899", "#3b82f6"];

/** A short confetti fall over the parent (which must be `relative`). */
export function Confetti() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {Array.from({ length: 16 }, (_, i) => (
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
      <p className="text-xs font-medium text-violet-800">{label}</p>
      <div className="flex gap-1.5" role="timer" aria-label={label}>
        {parts.map((p) => (
          <div
            key={p.l}
            className="min-w-14 rounded-lg bg-violet-100 px-2 py-1 text-center"
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

/**
 * One badge of the challenge as a mission: the badge art inside a progress
 * ring, its name and where the player stands.
 */
export function MissionTile({
  id,
  name,
  status,
  fraction,
  detail,
  action,
}: {
  id: number;
  name: string;
  status: "held" | "claim" | "missing";
  /** 0..1, how much of the badge's goal is done. */
  fraction: number;
  detail: React.ReactNode;
  action?: React.ReactNode;
}) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const f = status === "missing" ? Math.max(0, Math.min(1, fraction)) : 1;
  const stroke =
    status === "held" ? "#10b981" : status === "claim" ? "#f59e0b" : "#7c3aed";
  return (
    <li
      className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${
        status === "held"
          ? "border-emerald-200 bg-emerald-50"
          : status === "claim"
            ? "border-amber-200 bg-amber-50"
            : "border-violet-200 bg-white"
      }`}
    >
      <span className="relative inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center">
        <svg
          aria-hidden
          width="52"
          height="52"
          viewBox="0 0 52 52"
          className="absolute inset-0"
        >
          <circle
            cx="26"
            cy="26"
            r={r}
            fill="none"
            stroke="#ede9fe"
            strokeWidth="4"
          />
          <circle
            cx="26"
            cy="26"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`}
            transform="rotate(-90 26 26)"
            className="mission-ring"
          />
        </svg>
        <BadgeArt id={id} unlocked={status !== "missing"} size={30} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm leading-tight font-semibold break-words text-zinc-900">
          {name}
        </span>
        <span className="text-xs text-zinc-600 tabular-nums">{detail}</span>
        {action}
      </span>
    </li>
  );
}

/** The player's entry, drawn as a ticket stub. */
export function EntryTicket({
  kicker,
  title,
  line,
}: {
  kicker: string;
  title: string;
  line: string;
}) {
  return (
    <div className="ticket-in flex overflow-hidden rounded-xl bg-violet-700 text-white shadow-sm">
      <div className="flex min-w-0 flex-1 flex-col px-4 py-3">
        <p className="text-[11px] font-semibold tracking-wide uppercase opacity-80">
          {kicker}
        </p>
        <p className="truncate text-lg font-black">{title}</p>
        <p className="text-xs opacity-90">{line}</p>
      </div>
      <div className="flex w-16 items-center justify-center border-l-2 border-dashed border-violet-300">
        <span aria-hidden className="text-3xl">
          🎟️
        </span>
      </div>
    </div>
  );
}
