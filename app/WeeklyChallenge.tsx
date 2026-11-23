"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { track } from "@/lib/analytics";
import { useEnterChallenge } from "@/lib/challenges/useEnterChallenge";
import { useClaimTreasures } from "@/lib/drops/useClaimTreasures";
import { formatPrize } from "@/lib/drops/format";
import { ChallengeReminder } from "@/app/ChallengeReminder";
import { entryStanding } from "@/lib/challenges/standing";
import { useLocale } from "@/lib/i18n";
import { badgeCopy } from "@/lib/onchain/badgeArt";
import { useWallet } from "@/lib/wallet/useWallet";
import { shareTo } from "@/lib/client/share";
import {
  Chest,
  CoinJar,
  Confetti,
  CountdownBlocks,
  HexMissions,
  HoldButton,
  MiniHexes,
  Sheet,
  TiltTicket,
  shortLeft,
  useRevealed,
  type HexMissionData,
} from "@/app/ChallengeBits";

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
  /** Entrants holding every badge right now; null or absent when unknown. */
  qualified?: number | null;
  pool: string;
  result: { winners?: string[]; perWinner?: string } | null;
};

type Progress = { id: number; have: number; need: number; metric: string };

type Previous = View & {
  winnerNames?: { address: string; name: string | null }[];
};

/** MiniPay's add-cash screen, scoped to the token the entry is paid in. */
const ADD_CASH_URL = "https://link.minipay.xyz/add_cash?tokens=USDT";

type Payload = {
  challenge: View | null;
  /** Last week's challenge, shown beside a live one. */
  previous?: Previous | null;
  spender?: Address | null;
  approveAmount?: string | null;
  /** Server-side pause on entering. See lib/challenges/paused. */
  entriesPaused?: boolean;
  player?: {
    entered: boolean;
    held: number[];
    /** False when the chain could not be read: `held` is then not a fact. */
    heldKnown?: boolean;
    claimable: number[];
    progress?: Progress[];
    previous?: {
      entered: boolean;
      won: boolean;
      prize: "unpaid" | "claimable" | "pending" | "claimed" | null;
    } | null;
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
  // Ticks once a minute so the countdown moves and the card flips to
  // "closed" on its own when the deadline passes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const q = address ? `?address=${address}` : "";
    void fetch(`/api/challenges/current${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { challenge: null }))
      .then((body: Payload) => {
        if (cancelled) return;
        setData(body);
        // Only count a view the player can actually see. This fires from the
        // fetch, which knows a challenge exists but not that the render below
        // hides the card while entries are paused, so from 07:13 UTC on 8 Nov
        // 2026 every home-page load recorded a view of a card nobody was
        // shown: 822 of them before this was caught. The render's condition
        // has to be mirrored here, not assumed.
        if (body.challenge && body.entriesPaused !== true) {
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
  const prize = useClaimTreasures(address ?? null, "challenge");
  // Last week's result sits in a chest until the player opens it, once.
  const [revealed, reveal] = useRevealed(
    data?.previous && data.player?.previous?.entered ? data.previous.id : null,
  );
  const [burst, setBurst] = useState(false);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const closeSheet = useCallback(() => setOpen(false), []);

  if (!c) return null;
  // Paused: the whole card goes, not just its button. Entering is the only
  // thing it is for, and a challenge you cannot enter is an advert for a
  // disappointment. Nothing is lost by hiding it: `challenge_entered` has
  // never fired, so no one has an entry to come back and check on. The
  // server refuses entry independently, so this is presentation only. See
  // lib/challenges/paused.
  if (data?.entriesPaused === true) return null;
  const entriesOpen =
    now < new Date(c.entryClosesAt).getTime() &&
    now < new Date(c.closesAt).getTime();
  const closed = now >= new Date(c.closesAt).getTime();
  const entered = data?.player?.entered || state === "entered";
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
  const won =
    !!address && (c.result?.winners ?? []).includes(address.toLowerCase());
  // Paid is not in the draw. Only said when the server told us where the
  // player stands (`data.player`), never from an entry made this second.
  const standing =
    entered && data?.player && data.player.heldKnown !== false
      ? entryStanding({ badgeIds: c.badgeIds, held, claimable })
      : null;
  const perWinner = c.result?.perWinner
    ? formatPrize(c.token, c.result.perWinner, locale)
    : null;
  const progress = new Map(
    (data?.player?.progress ?? []).map((p) => [p.id, p]),
  );
  // Distances are kept in meters; show km.
  const amount = (p: Progress, v: number) =>
    p.metric === "bestRunDistance" || p.metric === "lifetimeDistance"
      ? `${Math.floor(v / 100) / 10} km`
      : String(v);
  const prev = data?.previous ?? null;
  const prevMine = data?.player?.previous ?? null;
  const prevPerWinner = prev?.result?.perWinner
    ? formatPrize(prev.token, prev.result.perWinner, locale)
    : null;
  const prevNamed = (prev?.winnerNames ?? [])
    .map((w) => w.name)
    .filter((n): n is string => !!n);
  const prevCount = prev?.result?.winners?.length ?? 0;

  const missions: HexMissionData[] = c.badgeIds.map((id) => {
    const status: HexMissionData["status"] = held.has(id)
      ? "held"
      : claimable.has(id)
        ? "claim"
        : "missing";
    const p = status === "missing" ? progress.get(id) : undefined;
    return {
      id,
      name: badgeCopy(id, locale === "es" ? "es" : "en").name,
      status,
      fraction: p ? p.have / p.need : 0,
      short:
        status === "held"
          ? t("challenge.mission.done")
          : status === "claim"
            ? t("challenge.mission.claim")
            : p
              ? `${amount(p, p.have)}/${amount(p, p.need)}`
              : "0",
    };
  });
  const selected =
    missions.find((m) => m.id === pick) ??
    missions.find((m) => m.status !== "held") ??
    missions[0] ??
    null;
  const hintFor = (m: HexMissionData) => {
    const p = progress.get(m.id);
    return m.status === "held"
      ? t("challenge.hint.held").replace("{name}", m.name)
      : m.status === "claim"
        ? t("challenge.hint.claim").replace("{name}", m.name)
        : p
          ? t("challenge.hint.progress")
              .replace("{name}", m.name)
              .replace("{have}", amount(p, p.have))
              .replace("{need}", amount(p, p.need))
          : t("challenge.hint.missing").replace("{name}", m.name);
  };
  const resultPending =
    !!prev &&
    !!prevMine?.entered &&
    ((!revealed && prevMine.prize !== "claimed") ||
      (prevMine.won && prevMine.prize === "claimable"));

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          track("challenge_opened", {
            challenge: c.id,
            pending_result: resultPending,
          });
        }}
        className="relative flex w-full items-center gap-3 rounded-2xl bg-violet-700 p-3.5 text-left text-white shadow-lg shadow-violet-700/30 active:scale-[0.99]"
      >
        <MiniHexes done={c.badgeIds.map((id) => held.has(id))} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-semibold opacity-85">
            {resultPending
              ? t("challenge.teaser.result")
              : t("challenge.teaser.missions")
                  .replace(
                    "{n}",
                    String(c.badgeIds.filter((id) => held.has(id)).length),
                  )
                  .replace("{m}", String(c.badgeIds.length))}
          </span>
          <span className="truncate text-lg leading-tight font-black">
            {locale === "es" ? c.title.es : c.title.en}
          </span>
          <span className="text-xs opacity-90">
            {closed
              ? t("challenge.teaser.closed")
              : entered
                ? t("challenge.teaser.in")
                : (shortLeft(new Date(c.entryClosesAt).getTime() - now) ?? "")}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-xl leading-none font-black text-amber-300">
            {formatPrize(c.token, c.pool, locale)}
          </span>
          <span className="text-[11px] opacity-85">{t("challenge.pool")}</span>
        </span>
        {resultPending && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-red-500"
          />
        )}
      </button>

      <Sheet open={open} onClose={closeSheet} closeLabel={t("challenge.close")}>
        <div className="flex flex-col gap-4">
          {prev && prevMine?.entered && (
            <section
              className={`relative flex flex-col items-center gap-2 overflow-hidden rounded-md border px-4 py-3 text-center ${
                !revealed && prevMine.prize !== "claimed"
                  ? "border-violet-200 bg-violet-50 text-violet-950"
                  : prevMine.won
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-zinc-200 bg-zinc-50 text-zinc-800"
              }`}
            >
              <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
                {t("challenge.prev.kicker").replace(
                  "{title}",
                  locale === "es" ? prev.title.es : prev.title.en,
                )}
              </p>
              {!revealed && prevMine.prize !== "claimed" ? (
                <Chest
                  label={t("challenge.reveal.tap")}
                  onOpen={() => {
                    reveal();
                    setBurst(true);
                    track("challenge_result_revealed", {
                      challenge: prev.id,
                      won: prevMine.won,
                    });
                  }}
                />
              ) : prevMine.won && prevPerWinner ? (
                <>
                  {burst && <Confetti />}
                  <p className="prize-pop text-2xl font-black">
                    🎉{" "}
                    {t("challenge.prev.won").replace("{amount}", prevPerWinner)}
                  </p>
                  {prevMine.prize === "claimed" || prize.state === "sent" ? (
                    <>
                      <p className="text-sm font-medium">
                        ✅{" "}
                        {t(
                          prevMine.prize === "claimed"
                            ? "challenge.prev.claimed"
                            : "challenge.prev.sent",
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          track("challenge_win_shared", { challenge: prev.id });
                          void shareTo(
                            "x",
                            t("challenge.share.won").replace(
                              "{amount}",
                              prevPerWinner,
                            ),
                            "https://miniklaim.fun",
                          );
                        }}
                        className="rounded-full border border-emerald-600 px-5 py-1.5 text-xs font-semibold text-emerald-800"
                      >
                        {t("challenge.share")}
                      </button>
                    </>
                  ) : prevMine.prize === "pending" ? (
                    <p className="text-sm font-medium">
                      ⏳ {t("challenge.prev.sent")}
                    </p>
                  ) : prevMine.prize === "claimable" ? (
                    <>
                      <button
                        onClick={() =>
                          void prize.claim(1).then((ok) => ok && load())
                        }
                        disabled={prize.state === "claiming"}
                        className="rounded-full bg-emerald-600 px-8 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {prize.state === "claiming"
                          ? t("challenge.prev.claiming")
                          : t("challenge.prev.claim").replace(
                              "{amount}",
                              prevPerWinner,
                            )}
                      </button>
                      {prize.state === "error" && (
                        <p className="text-xs text-red-700">
                          {t("challenge.prev.failed")}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm">{t("challenge.prev.unpaid")}</p>
                  )}
                </>
              ) : (
                <p className="prize-pop text-sm">
                  {prevPerWinner && prevCount > 0
                    ? t("challenge.prev.lost")
                        .replace("{n}", String(prevCount))
                        .replace("{amount}", prevPerWinner)
                    : t("challenge.result.pending")}
                </p>
              )}
            </section>
          )}
          <div className="text-center">
            <p className="text-xs font-semibold tracking-wide text-violet-700 uppercase">
              🏆 {t("challenge.kicker")}
            </p>
            <h2 className="text-xl font-black text-violet-950">
              {locale === "es" ? c.title.es : c.title.en}
            </h2>
            {/* How long is left, always in view: entered or not, open or
            closed. The exact time is in the tooltip. */}
            {closed ? (
              <p className="mt-0.5 text-xs font-medium text-violet-800">
                {t("challenge.closedAt").replace("{date}", fmtDate(c.closesAt))}
              </p>
            ) : (
              <div
                className="mt-2"
                title={
                  entriesOpen && !entered
                    ? t("challenge.entriesUntil").replace(
                        "{date}",
                        fmtDate(c.entryClosesAt),
                      )
                    : t("challenge.endsAt").replace(
                        "{date}",
                        fmtDate(c.closesAt),
                      )
                }
              >
                <CountdownBlocks
                  msLeft={
                    new Date(
                      entriesOpen && !entered ? c.entryClosesAt : c.closesAt,
                    ).getTime() - now
                  }
                  label={t(
                    entriesOpen && !entered
                      ? "challenge.entriesLeft"
                      : "challenge.closesIn",
                  )
                    .replace("{left}", "")
                    .trim()}
                  units={{
                    d: t("challenge.unit.d"),
                    h: t("challenge.unit.h"),
                    m: t("challenge.unit.m"),
                  }}
                />
              </div>
            )}
          </div>

          <CoinJar
            coins={c.entrants}
            amount={formatPrize(c.token, c.pool, locale)}
            caption={t("challenge.jar")
              .replace("{n}", String(c.entrants))
              .replace("{w}", String(c.winners))}
          />
          {typeof c.qualified === "number" && c.entrants > 0 && (
            <p className="text-center text-xs font-semibold text-violet-900">
              {t("challenge.qualified")
                .replace("{n}", String(c.qualified))
                .replace("{m}", String(c.entrants))}
            </p>
          )}
          {prev && !prevMine?.entered && prevCount > 0 && prevPerWinner && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-900">
              🎉{" "}
              {t("challenge.prev.proof")
                .replace("{n}", String(prevCount))
                .replace("{amount}", prevPerWinner)}
              {prevNamed.length > 0 && (
                <>
                  {" "}
                  <span className="font-semibold">
                    {prevNamed
                      .slice(0, 5)
                      .map((n) => `@${n}`)
                      .join(", ")}
                    {prevCount > Math.min(5, prevNamed.length)
                      ? " " +
                        t("challenge.prev.more").replace(
                          "{n}",
                          String(prevCount - Math.min(5, prevNamed.length)),
                        )
                      : ""}
                  </span>
                </>
              )}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-center text-xs font-bold tracking-wide text-violet-700 uppercase">
              {t("challenge.missions")}
            </p>
            <HexMissions
              items={missions}
              selected={selected?.id ?? null}
              onSelect={setPick}
            />
            {selected && (
              <div className="rounded-xl bg-violet-50 px-3 py-2 text-center text-sm text-violet-950">
                {hintFor(selected)}
                {selected.status === "claim" && (
                  <>
                    {" "}
                    <Link
                      href="/me"
                      className="font-semibold text-violet-700 underline"
                    >
                      {t("challenge.reminder.ctaClaim")}
                    </Link>
                  </>
                )}
              </div>
            )}
            <p className="text-center text-xs text-violet-700">
              {t("challenge.rule")}
            </p>
          </div>

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
          ) : entered && standing && standing.state !== "in" ? (
            <div className="flex flex-col items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-center text-sm font-semibold text-amber-900">
                ⚠️{" "}
                {t("challenge.notInYet").replace(
                  "{n}",
                  String(standing.missing),
                )}
              </p>
              <p className="text-center text-xs text-amber-900">
                {t(
                  standing.state === "claim"
                    ? "challenge.reminder.claim"
                    : "challenge.reminder.run",
                )}
              </p>
              <Link
                href={standing.state === "claim" ? "/me" : "/run"}
                className="text-xs font-semibold text-violet-700 underline"
              >
                {t(
                  standing.state === "claim"
                    ? "challenge.reminder.ctaClaim"
                    : "challenge.reminder.ctaRun",
                )}
              </Link>
              <ChallengeReminder
                challengeId={c.id}
                standing={standing}
                total={c.badgeIds.length}
                closesLabel={fmtDate(c.closesAt)}
              />
            </div>
          ) : entered ? (
            <div className="flex flex-col gap-2">
              <TiltTicket
                kicker={t("challenge.ticket.kicker")}
                title={locale === "es" ? c.title.es : c.title.en}
                line={t("challenge.ticket.line").replace(
                  "{date}",
                  fmtDate(c.closesAt),
                )}
              />
              <p className="text-center text-sm font-medium text-emerald-800">
                ✅ {t(standing ? "challenge.inDraw" : "challenge.entered")}
              </p>
            </div>
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
              <HoldButton
                label={
                  needsApproval
                    ? t("challenge.holdApprove").replace("{amount}", price)
                    : t("challenge.hold").replace("{amount}", price)
                }
                holdingLabel={t("challenge.holding")}
                busyLabel={
                  state === "approving"
                    ? t("challenge.approving")
                    : t("challenge.entering")
                }
                busy={state === "approving" || state === "entering"}
                disabled={!address}
                onConfirm={() => void enter()}
              />
              {state === "no-funds" && (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-xs text-red-700">
                    {t("challenge.noFunds").replace("{amount}", price)}
                  </p>
                  <a
                    href={ADD_CASH_URL}
                    onClick={() =>
                      track("challenge_add_cash_tapped", { challenge: c.id })
                    }
                    className="rounded-full border border-violet-700 px-5 py-1.5 text-xs font-semibold text-violet-800"
                  >
                    {t("challenge.addCash").replace("{amount}", price)}
                  </a>
                  <p className="text-center text-xs text-violet-800">
                    {t("challenge.addCashThen")}
                  </p>
                </div>
              )}
              {state === "rejected" && (
                <p className="text-center text-xs text-amber-800">
                  {t("challenge.approveRejected")
                    .replace("{approve}", approveLabel)
                    .replace("{amount}", price)}
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
            </>
          ) : (
            <p className="text-center text-xs text-violet-700">
              {t("challenge.entriesClosed")}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
