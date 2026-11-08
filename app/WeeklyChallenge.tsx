"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { track } from "@/lib/analytics";
import { useEnterChallenge } from "@/lib/challenges/useEnterChallenge";
import { formatPrize } from "@/lib/drops/format";
import { useLocale } from "@/lib/i18n";
import { badgeCopy } from "@/lib/onchain/badgeArt";
import { useWallet } from "@/lib/wallet/useWallet";

type View = {
  id: string;
  title: { en: string; es: string };
  badgeIds: number[];
  token: Address;
  entryAmount: string;
  winners: number;
  entryClosesAt: string;
  closesAt: string;
  status: string;
  entrants: number;
  pool: string;
  result: { winners?: string[]; perWinner?: string } | null;
};

type Payload = {
  challenge: View | null;
  spender?: Address | null;
  approveAmount?: string | null;
  /** Server-side pause on entering. See lib/challenges/paused. */
  entriesPaused?: boolean;
  player?: {
    entered: boolean;
    held: number[];
    claimable: number[];
    allowance: string | null;
    balance: string | null;
  };
};

/**
 * The weekly challenge card: pool, entrants, the badges that qualify and where
 * the player stands on each, and the paid entry. Hidden when no challenge is
 * running or recently closed.
 */
export function WeeklyChallenge() {
  const { t, locale } = useLocale();
  const { address } = useWallet();
  const [data, setData] = useState<Payload | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const q = address ? `?address=${address}` : "";
    void fetch(`/api/challenges/current${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { challenge: null }))
      .then((body: Payload) => {
        if (cancelled) return;
        setData(body);
        if (body.challenge) {
          track("challenge_viewed", {
            challenge: body.challenge.id,
            entered: !!body.player?.entered,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [address, refresh]);

  const c = data?.challenge ?? null;
  const allowance = data?.player?.allowance
    ? BigInt(data.player.allowance)
    : null;
  const approveTotal = data?.approveAmount ? BigInt(data.approveAmount) : null;
  const { enter, state } = useEnterChallenge({
    address: (address as Address) ?? null,
    challengeId: c?.id ?? null,
    token: c?.token ?? null,
    amount: c ? BigInt(c.entryAmount) : null,
    spender: data?.spender ?? null,
    approveAmount: approveTotal,
    allowance,
    onEntered: load,
  });

  if (!c) return null;
  const now = Date.now();
  const entriesOpen =
    now < new Date(c.entryClosesAt).getTime() &&
    now < new Date(c.closesAt).getTime();
  const closed = now >= new Date(c.closesAt).getTime();
  const entered = data?.player?.entered || state === "entered";
  // Paused server-side; the button would only lead to a wallet refusal. See
  // lib/challenges/paused. The challenge itself stays visible: its pool,
  // badges and dates are still real and still worth reading.
  const entriesPaused = data?.entriesPaused === true;
  const price = formatPrize(c.token, c.entryAmount, locale);
  // Unknown (read failed) shows the one-tap copy; the hook asks for the approval if it turns out missing.
  const needsApproval = allowance !== null && allowance < BigInt(c.entryAmount);
  const approveLabel = approveTotal
    ? formatPrize(c.token, approveTotal.toString(), locale)
    : price;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === "es" ? "es-CO" : "en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  const held = new Set(data?.player?.held ?? []);
  const claimable = new Set(data?.player?.claimable ?? []);
  const anyMissing = c.badgeIds.some(
    (id) => !held.has(id) && !claimable.has(id),
  );
  const won =
    !!address && (c.result?.winners ?? []).includes(address.toLowerCase());
  const perWinner = c.result?.perWinner
    ? formatPrize(c.token, c.result.perWinner, locale)
    : null;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-violet-200 bg-violet-50 px-4 py-3">
      <div className="text-center">
        <p className="text-xs font-semibold tracking-wide text-violet-700 uppercase">
          🏆 {t("challenge.kicker")}
        </p>
        <h2 className="text-base font-bold text-violet-950">
          {locale === "es" ? c.title.es : c.title.en}
        </h2>
      </div>

      <div className="flex items-center justify-around text-center text-sm text-violet-950">
        <div>
          <p className="text-lg font-bold">
            {formatPrize(c.token, c.pool, locale)}
          </p>
          <p className="text-xs text-violet-700">{t("challenge.pool")}</p>
        </div>
        <div>
          <p className="text-lg font-bold">{c.entrants}</p>
          <p className="text-xs text-violet-700">
            {t("challenge.entrants").replace("{n} ", "")}
          </p>
        </div>
        <div>
          <p className="text-lg font-bold">{c.winners}</p>
          <p className="text-xs text-violet-700">
            {t("challenge.winners").replace("{n} ", "")}
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-violet-800">
        {t("challenge.rule")}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {c.badgeIds.map((id) => {
          const name = badgeCopy(id, locale === "es" ? "es" : "en").name;
          const status = held.has(id)
            ? "held"
            : claimable.has(id)
              ? "claim"
              : "missing";
          return (
            <li
              key={id}
              className="flex items-center justify-between gap-2 text-zinc-800"
            >
              <span className="truncate">
                {status === "held" ? "✅" : status === "claim" ? "🟡" : "⬜"}{" "}
                {name}
              </span>
              {status === "claim" ? (
                <Link
                  href="/me"
                  className="shrink-0 text-xs font-semibold text-violet-700 underline"
                >
                  {t("challenge.badge.claim")}
                </Link>
              ) : (
                <span className="shrink-0 text-xs text-zinc-600">
                  {status === "held"
                    ? t("challenge.badge.held")
                    : t("challenge.badge.missing")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {address && anyMissing && !closed && (
        <p className="text-center text-xs text-violet-800">
          {t("challenge.howToFirst")}
        </p>
      )}

      {closed ? (
        <p className="text-center text-sm font-medium text-violet-950">
          {won && perWinner
            ? t("challenge.result.won").replace("{amount}", perWinner)
            : c.status === "rolled"
              ? t("challenge.result.rolled")
              : c.result?.winners && perWinner
                ? t("challenge.result.done")
                    .replace("{n}", String(c.result.winners.length))
                    .replace("{amount}", perWinner)
                : t("challenge.result.pending")}
        </p>
      ) : entered ? (
        <p className="text-center text-sm font-medium text-emerald-800">
          ✅ {t("challenge.entered")}
        </p>
      ) : entriesPaused ? (
        <>
          <p className="text-center text-sm font-medium text-amber-800">
            {t("challenge.paused")}
          </p>
          <p className="text-center text-xs text-violet-700">
            {t("challenge.pausedWhy")}
          </p>
        </>
      ) : entriesOpen ? (
        <>
          {address && (
            <p className="text-center text-xs text-violet-800">
              {needsApproval
                ? t("challenge.approveWhy")
                    .replace("{approve}", approveLabel)
                    .replace("{amount}", price)
                : t("challenge.oneTap").replace("{amount}", price)}
            </p>
          )}
          <button
            onClick={() => void enter()}
            disabled={!address || state === "approving" || state === "entering"}
            className="mx-auto rounded-full bg-violet-700 px-8 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
          >
            {state === "approving"
              ? t("challenge.approving")
              : state === "entering"
                ? t("challenge.entering")
                : needsApproval
                  ? t("challenge.approveEnter").replace("{amount}", price)
                  : t("challenge.enter").replace("{amount}", price)}
          </button>
          {state === "no-funds" && (
            <p className="text-center text-xs text-red-700">
              {t("challenge.noFunds").replace("{amount}", price)}
            </p>
          )}
          {state === "error" && (
            <p className="text-center text-xs text-red-700">
              {t("challenge.failed")}
            </p>
          )}
          {state === "closed" && (
            <p className="text-center text-xs text-red-700">
              {t("challenge.entriesClosed")}
            </p>
          )}
          <p className="text-center text-xs text-violet-700">
            {t("challenge.entriesUntil").replace(
              "{date}",
              fmtDate(c.entryClosesAt),
            )}{" "}
            · {t("challenge.endsAt").replace("{date}", fmtDate(c.closesAt))}
          </p>
        </>
      ) : (
        <p className="text-center text-xs text-violet-700">
          {t("challenge.entriesClosed")}{" "}
          {t("challenge.endsAt").replace("{date}", fmtDate(c.closesAt))}
        </p>
      )}
    </section>
  );
}
