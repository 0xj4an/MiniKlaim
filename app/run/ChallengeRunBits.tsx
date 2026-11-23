"use client";

import { useEffect, useState } from "react";
import { badgeCopy } from "@/lib/onchain/badgeArt";
import { useLocale } from "@/lib/i18n";

/**
 * The weekly challenge inside a run: a chip with the mission the run can move,
 * and a line in the finished-run card with where the challenge stands.
 *
 * Both are optional extras. They fetch on their own, render nothing until
 * they have data, and swallow every failure: a run must never depend on them.
 */

type Progress = { id: number; have: number; need: number; metric: string };
type Payload = {
  challenge: { id: string; badgeIds: number[]; status: string } | null;
  entriesPaused?: boolean;
  player?: {
    held?: number[];
    claimable?: number[];
    progress?: Progress[];
  } | null;
};

function useChallenge(address: string | null, delayMs = 0) {
  const [data, setData] = useState<Payload | null>(null);
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/challenges/current?address=${address.toLowerCase()}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: Payload | null) => {
          if (!cancelled && body) setData(body);
        })
        .catch(() => undefined);
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, delayMs]);
  if (!data?.challenge || data.challenge.status !== "open") return null;
  if (data.entriesPaused === true) return null;
  return data;
}

// What a run in progress adds to a mission's count before the server has
// seen it. Other metrics (streak, cities, distance) only move at the finish.
function live(p: Progress, blocks: number, stolen: number): number {
  const have =
    p.metric === "bestRunHexes"
      ? Math.max(p.have, blocks)
      : p.metric === "hexesOwned"
        ? p.have + blocks
        : p.metric === "conquests"
          ? p.have + stolen
          : p.have;
  return Math.min(p.need, have);
}

const LIVE = ["bestRunHexes", "hexesOwned", "conquests"];

/** During a run: the first unfinished mission, counting this run's blocks. */
export function ChallengeRunChip({
  address,
  blocks,
  stolen,
}: {
  address: string | null;
  blocks: number;
  stolen: number;
}) {
  const { t, locale } = useLocale();
  const data = useChallenge(address);
  const open = (data?.player?.progress ?? []).filter((p) => {
    const held = data?.player?.held ?? [];
    const claimable = data?.player?.claimable ?? [];
    return !held.includes(p.id) && !claimable.includes(p.id) && p.have < p.need;
  });
  const p = open.find((x) => LIVE.includes(x.metric));
  if (!p) return null;
  const have = live(p, blocks, stolen);
  return (
    <div
      role="status"
      className="absolute top-[3.25rem] right-4 z-10 w-40 rounded-md bg-white/90 px-2.5 py-1.5 shadow-md backdrop-blur"
    >
      <p className="truncate text-[11px] font-semibold text-violet-700">
        {t("challenge.run.chip")}:{" "}
        {badgeCopy(p.id, locale === "es" ? "es" : "en").name} {have}/{p.need}
      </p>
      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-zinc-200">
        <span
          className="block h-full rounded-full bg-violet-600 transition-[width] duration-500"
          style={{ width: `${(have / p.need) * 100}%` }}
        />
      </span>
    </div>
  );
}

/** In the finished-run card: where the weekly challenge stands now. */
export function ChallengeMovedNote({ address }: { address: string | null }) {
  const { t } = useLocale();
  // The finish settles the run's stats first; ask a moment later.
  const data = useChallenge(address, 1500);
  if (!data?.challenge || !data.player) return null;
  const total = data.challenge.badgeIds.length;
  if (total === 0) return null;
  const earned = new Set([
    ...(data.player.held ?? []),
    ...(data.player.claimable ?? []),
  ]);
  const n = data.challenge.badgeIds.filter((id) => earned.has(id)).length;
  return (
    // Not a link: the claim for this run may still be open in the wallet, and
    // leaving the card mid-claim would strand it.
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 text-left">
      <span
        aria-hidden
        className="hex-cell h-[26px] w-[30px] shrink-0 bg-violet-600"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold text-zinc-900">
          {t("challenge.moved")
            .replace("{n}", String(n))
            .replace("{m}", String(total))}
        </span>
        <span className="block h-1.5 overflow-hidden rounded-full bg-zinc-200">
          <span
            className="block h-full rounded-full bg-violet-600"
            style={{ width: `${(n / total) * 100}%` }}
          />
        </span>
      </span>
    </div>
  );
}
