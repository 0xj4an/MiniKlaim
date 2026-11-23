"use client";

import { HexRing, Pips } from "@/app/Hex";
import { useEffect, useState } from "react";
import { badgeCopy } from "@/lib/onchain/badgeArt";
import { useLocale } from "@/lib/i18n";
import { useUserStats } from "@/lib/wallet/useUserStats";

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

/** Badge 16, "Big run": five blocks in one run (lib/onchain/badgeRules). */
const FIRST_MISSION = { id: 16, need: 5 };

/**
 * During a run: one goal the blocks of this run move, with pips that fill
 * as they are captured.
 *
 * A weekly-challenge mission comes first when the player has one open. With
 * none, a player who has never captured five blocks in a run gets that badge
 * as the goal. The typical run was 75 seconds and one block (PostHog, 14
 * days to 23 Nov 2026): the player tried the button, saw one block and left
 * with nothing to aim for. Five blocks is a street, and it ends in a badge.
 */
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
  const stats = useUserStats(address);
  const open = (data?.player?.progress ?? []).filter((p) => {
    const held = data?.player?.held ?? [];
    const claimable = data?.player?.claimable ?? [];
    return !held.includes(p.id) && !claimable.includes(p.id) && p.have < p.need;
  });
  const mission = open.find((x) => LIVE.includes(x.metric));
  const first =
    !mission && stats && stats.bestRunHexes < FIRST_MISSION.need
      ? FIRST_MISSION
      : null;
  if (!mission && !first) return null;

  const id = mission ? mission.id : FIRST_MISSION.id;
  const need = mission ? mission.need : FIRST_MISSION.need;
  const have = mission
    ? live(mission, blocks, stolen)
    : Math.min(need, blocks);
  const done = have >= need;
  const name = badgeCopy(id, locale === "es" ? "es" : "en").name;
  return (
    <div
      role="status"
      className={`absolute top-[3.75rem] right-3 left-3 z-10 mx-auto flex max-w-md items-center justify-between gap-3 rounded-[0.875rem] border-[1.5px] px-3 py-2 text-sm leading-tight ${
        done
          ? "border-emerald-700 bg-emerald-700 font-semibold text-white"
          : `border-zinc-200 bg-white font-medium text-zinc-900 ${mission ? "" : ""}`
      }`}
    >
      <span className="min-w-0 truncate">
        {done
          ? t("run.mission.done").replace("{name}", name)
          : `${t(mission ? "challenge.run.chip" : "run.mission.badge")}: ${name}`}
      </span>
      {need <= 10 ? (
        <Pips
          n={need}
          on={have}
          className={done ? "text-white" : mission ? "text-reto" : "text-mine"}
          label={`${have}/${need}`}
        />
      ) : (
        <span className="shrink-0 tabular-nums">
          {have}/{need}
        </span>
      )}
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
    <div className="flex items-center gap-2.5 border-b border-zinc-200 py-2 text-left">
      <HexRing className="h-5 w-[18px] shrink-0 text-reto" />
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-900">
        {t("challenge.kicker")}
      </span>
      <Pips
        n={total}
        on={n}
        className="text-reto"
        label={t("challenge.teaser.count")
          .replace("{n}", String(n))
          .replace("{m}", String(total))}
      />
    </div>
  );
}
