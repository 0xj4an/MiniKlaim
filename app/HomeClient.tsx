"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { groupNumber } from "@/lib/formatNumber";
import { useFirstVisit } from "@/lib/useFirstVisit";
import { useGlobalStats } from "@/lib/useGlobalStats";
import { useRecoveryNotice } from "@/lib/useRecoveryNotice";
import { RecoveryNotice } from "@/app/RecoveryNotice";
import { useLocale } from "@/lib/i18n";
import { useActiveRun } from "@/lib/wallet/useActiveRun";
import {
  type WalletEnvironment,
  useWalletEnvironment,
} from "@/lib/wallet/environment";
import { LinkExisting } from "@/app/LinkExisting";
import { BadgeClaimPrompt } from "@/app/BadgeClaimPrompt";
import { WeeklyChallenge } from "@/app/WeeklyChallenge";
import { PendingClaimPrompt } from "@/app/PendingClaimPrompt";
import { NeedCeloNote } from "@/app/NeedCeloNote";
import { ReturnNote } from "@/app/ReturnNote";
import { type Losses, useLosses } from "@/app/LossNotice";
import { LogoWordmark } from "@/app/Logo";
import { TerritoryMini } from "@/app/TerritoryMini";
import { StreakCard } from "@/app/StreakCard";
import { NoticeStack } from "@/app/NoticeStack";
import { useUser } from "@/lib/wallet/useUser";
import { type UserStats, useUserStats } from "@/lib/wallet/useUserStats";
import { NAMED_COOKIE } from "@/lib/namedCookie";
import { useWallet } from "@/lib/wallet/useWallet";

export function HomeClient({ namedHint = false }: { namedHint?: boolean }) {
  const {
    address,
    isConnected,
    isConnecting,
    isMiniPay,
    isWrongChain,
    isSwitchingChain,
    connect,
    switchToCelo,
  } = useWallet();

  const { user } = useUser(isConnected ? address : null);
  const { active: activeRun } = useActiveRun(
    isConnected && !isWrongChain ? address : null,
  );
  const globalStats = useGlobalStats();
  const { showOnboarding, dismiss } = useFirstVisit();
  const { showRecovery, dismiss: dismissRecovery } = useRecoveryNotice(
    user ?? null,
  );
  const { t, locale } = useLocale();
  const env = useWalletEnvironment();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  const named = mounted && isConnected && !isWrongChain && !!user?.username;
  // Remember that this browser has a named player, so the server renders the
  // returning-player home (small logo, no tagline) on the next open.
  useEffect(() => {
    if (!named) return;
    const had = document.cookie.includes(`${NAMED_COOKIE}=1`);
    document.cookie = `${NAMED_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
    // First time on this browser: re-render the server part now, so the
    // tagline gives way to the player's card without waiting for a reload.
    if (!had) router.refresh();
  }, [named, router]);

  // Auto-navigate to /run once the wallet is ready after the user tapped the
  // sign-in CTA. Skips the intermediate "Run" button-tap so the whole flow
  // is a single "Sign in to run" action. Only fires when the user explicitly
  // initiated the connect, so returning to home after a run does not bounce
  // them straight back into /run.
  const pendingRunRef = useRef(false);
  const requestSignInAndRun = () => {
    pendingRunRef.current = true;
    connect();
  };
  useEffect(() => {
    if (!pendingRunRef.current) return;
    if (isConnected && !isWrongChain && user?.username) {
      pendingRunRef.current = false;
      router.push("/run");
    }
  }, [isConnected, isWrongChain, user?.username, router]);

  // The band shows the player as soon as the server knows this browser has
  // one (the cookie), so nothing jumps when the wallet connects.
  const showPlayer = named || (namedHint && !mounted);
  const stats = useUserStats(named ? address : null);
  const { losses, clear: clearLosses } = useLosses(
    named ? (address ?? null) : null,
  );

  return (
    <>
      {/* The outage notice comes first: a returning player whose name is
          gone needs that explained before anything else on the screen. */}
      {showRecovery ? (
        <RecoveryNotice onClose={dismissRecovery} />
      ) : (
        showOnboarding && <OnboardingModal onClose={dismiss} />
      )}

      <header className="mk-band w-full">
        <div
          className={`mx-auto w-full max-w-md px-4 pt-4 ${showPlayer ? "pb-14" : "pb-12"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <LogoWordmark height={20} tone="white" />
            {named && user?.username && (
              <Link
                href="/me"
                className="min-w-0 truncate py-1 text-sm font-semibold text-white"
              >
                @{user.username}
              </Link>
            )}
          </div>
          {showPlayer ? (
            <>
              <h1 className="sr-only">{t("home.tagline")}</h1>
              <PlayerNumbers stats={stats} />
            </>
          ) : (
            <>
              <h1 className="mk-title mt-5 text-[2.125rem] text-balance text-white">
                {t("home.tagline")}
              </h1>
              <p className="mt-2 min-h-5 text-sm text-white">
                {globalStats && (
                  <>
                    <span className="font-semibold">
                      {groupNumber(globalStats.totalHexes, locale)}
                    </span>{" "}
                    {t("home.stats.blocks")},{" "}
                    <span className="font-semibold">
                      {groupNumber(globalStats.totalPlayers, locale)}
                    </span>{" "}
                    {globalStats.totalPlayers === 1
                      ? t("home.stats.player")
                      : t("home.stats.players")}
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-9 flex w-full max-w-md flex-col items-center gap-3 px-4">
        {showPlayer && (
          <LandCard
            stats={stats}
            losses={losses}
            onGo={() => {
              track("loss_notice_action", { action: "go" });
              clearLosses();
            }}
          />
        )}

        {mounted ? (
          <div
            className={
              showPlayer
                ? "flex w-full flex-col items-center"
                : "mk-tile flex w-full flex-col items-center px-4 py-5 text-center"
            }
          >
            <PrimaryCTA
              isConnected={isConnected}
              isConnecting={isConnecting}
              isMiniPay={isMiniPay}
              isWrongChain={isWrongChain}
              isSwitchingChain={isSwitchingChain}
              username={user?.username ?? null}
              lastRunAt={user?.lastRunAt ?? null}
              hasActiveRun={activeRun !== null}
              env={env}
              connect={requestSignInAndRun}
              switchToCelo={switchToCelo}
            />
          </div>
        ) : (
          <WelcomePlaceholder />
        )}

        {mounted && (
          <NoticeStack>
            <BadgeClaimPrompt
              address={address ?? null}
              enabled={isConnected && !isWrongChain && !!user?.username}
              variant="card"
              surface="home"
            />
            <NeedCeloNote
              address={address ?? null}
              enabled={isConnected && !isWrongChain}
            />
            <StreakCard
              address={address ?? null}
              enabled={isConnected && !isWrongChain && !!user?.username}
            />
          </NoticeStack>
        )}

        {mounted && <WeeklyChallenge />}

        {named && stats && stats.totalRuns > 0 && <PlayerPair stats={stats} />}

        {mounted && (
          <PendingClaimPrompt
            address={address ?? null}
            enabled={isConnected && !isWrongChain}
          />
        )}
      </div>
    </>
  );
}

/**
 * The player's three numbers on the orange band: blocks, world rank and
 * streak. Dashes hold their place until the stats arrive, so the band is its
 * final height from the first paint.
 */
function PlayerNumbers({ stats }: { stats: UserStats | null }) {
  const { t, locale } = useLocale();
  const n = (v: number | undefined) =>
    typeof v === "number" ? groupNumber(v, locale) : "-";
  const cells: [string, string][] = [
    [n(stats?.hexesOwned), t("me.stat.blocks")],
    [stats && stats.rank > 0 ? `#${n(stats.rank)}` : "-", t("home.card.rank")],
    [
      n(stats?.streak),
      stats?.streak === 1 ? t("me.stat.dayStreak") : t("me.stat.daysStreak"),
    ],
  ];
  return (
    <Link href="/me" className="mt-4 flex gap-5 text-left text-white">
      {cells.map(([value, label]) => (
        <span key={label} className="flex min-w-0 flex-col">
          <span className="mk-num text-[2.5rem] leading-[0.95]">{value}</span>
          <span className="mt-0.5 text-[13px] leading-tight">{label}</span>
        </span>
      ))}
    </Link>
  );
}

/**
 * The player's land beside whatever there is to say about it: blocks taken
 * while they were away, with the way to take them back, or how far it
 * reaches. The raid notice used to be a card of its own further down; here
 * it sits next to the thing it is about.
 */
function LandCard({
  stats,
  losses,
  onGo,
}: {
  stats: UserStats | null;
  losses: Losses | null;
  onGo: () => void;
}) {
  const { t, locale } = useLocale();
  const count = (
    key: "home.land.cities" | "home.land.countries",
    value: number,
  ) =>
    t(value === 1 ? `${key}.one` : key).replace(
      "{n}",
      groupNumber(value, locale),
    );
  const plural = (
    key:
      | "home.losses.captured"
      | "home.losses.attacked"
      | "home.losses.attacks",
    value: number,
  ) => t(value === 1 ? `${key}.one` : key).replace("{n}", String(value));

  let title: string;
  let line: string | null;
  let action: { href: string; label: string; onClick?: () => void } | null;
  if (losses) {
    const onlyAttacks = losses.captured === 0;
    title = onlyAttacks
      ? plural("home.losses.attacked", losses.attacked)
      : plural("home.losses.captured", losses.captured);
    const named = losses.by.slice(0, 2).map((p) => {
      const name = p.username ? `@${p.username}` : t("common.anonymous");
      const lost = onlyAttacks ? p.attacked : p.captured;
      return lost > 0 ? `${name} ${lost}` : name;
    });
    const others = losses.by.length - named.length;
    line = [
      ...named,
      others > 0 ? t("home.losses.more").replace("{n}", String(others)) : null,
      !onlyAttacks && losses.attacked > 0
        ? plural("home.losses.attacks", losses.attacked)
        : null,
    ]
      .filter(Boolean)
      .join(", ");
    action = { href: "/run", label: t("home.losses.go"), onClick: onGo };
  } else if (stats && stats.hexesOwned === 0) {
    title = t("home.land.empty");
    line = t("home.land.emptyHint");
    action = null;
  } else {
    title = t("home.land.title");
    line = stats
      ? [
          stats.cityCount > 0 ? count("home.land.cities", stats.cityCount) : null,
          stats.countryCount > 0
            ? count("home.land.countries", stats.countryCount)
            : null,
        ]
          .filter(Boolean)
          .join(", ")
      : null;
    action = { href: "/me", label: t("home.land.see") };
  }

  return (
    <div
      role={losses ? "status" : undefined}
      className="mk-tile flex w-full items-center gap-3 p-2 pr-3 text-left"
    >
      <Link href="/me" aria-label={t("home.land.title")} className="shrink-0">
        <TerritoryMini
          cells={stats?.mini?.cells}
          className="mk-well block h-[84px] w-[104px]"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-tight font-semibold text-zinc-900">
          {title}
        </p>
        <p className="mt-0.5 line-clamp-2 min-h-4 text-[13px] leading-tight text-zinc-500">
          {line}
        </p>
        {action && (
          <Link
            href={action.href}
            onClick={action.onClick}
            className="mk-btn mk-btn-sm mk-btn-ghost mt-2 px-4"
          >
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Two numbers the band has no room for: the best route and how many. */
function PlayerPair({ stats }: { stats: UserStats }) {
  const { t, locale } = useLocale();
  const cells: [string, string][] = [
    [groupNumber(stats.bestRunHexes, locale), t("home.pair.bestRun")],
    [groupNumber(stats.totalRuns, locale), t("home.pair.runs")],
  ];
  return (
    <div className="grid w-full grid-cols-2 gap-3 text-left">
      {cells.map(([value, label]) => (
        <div key={label} className="mk-flat px-3 py-2.5">
          <span className="mk-num block text-2xl leading-none text-zinc-900">
            {value}
          </span>
          <span className="mt-1 block text-[13px] leading-tight text-zinc-500">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function MovementModes() {
  const { t } = useLocale();
  return (
    <p
      className="flex items-center justify-center gap-3 text-2xl leading-none"
      aria-label={t("home.modes.label")}
    >
      <span aria-hidden>🏃</span>
      <span aria-hidden>🚲</span>
      <span aria-hidden>🏍️</span>
      <span aria-hidden>🚗</span>
      <span aria-hidden>✈️</span>
    </p>
  );
}

function WelcomePlaceholder() {
  return (
    <div className="h-14 w-full rounded-[0.875rem] bg-zinc-200" aria-hidden="true" />
  );
}

const ONBOARDING_STEPS = [
  {
    icon: "🗺️",
    title: "onboarding.step1.title",
    body: "onboarding.step1.body",
  },
  {
    icon: "👤",
    title: "onboarding.step2.title",
    body: "onboarding.step2.body",
  },
  {
    icon: "🏆",
    title: "onboarding.step3.title",
    body: "onboarding.step3.body",
  },
] as const;

function OnboardingModal({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const closeWith = (via: "cta" | "backdrop") => {
    track("onboarding_completed", { via });
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => closeWith("backdrop")}
    >
      <div
        className="mx-6 flex w-full max-w-sm flex-col gap-5 rounded-2xl bg-white p-6 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mk-title text-center text-2xl text-zinc-900">
          {t("onboarding.title")}
        </h2>
        {/* One row per idea: a tile and two short lines, read top to bottom.
            The old list was centered text beside numbers in another
            typeface, which read as three paragraphs rather than three steps. */}
        <ol className="flex flex-col gap-4">
          {ONBOARDING_STEPS.map((step) => (
            <li key={step.title} className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-xl leading-none"
              >
                {step.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-900">
                  {t(step.title)}
                </span>
                <span className="block text-[13px] leading-snug text-zinc-600">
                  {t(step.body)}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <button
          onClick={() => closeWith("cta")}
          className="mk-btn w-full px-6"
        >
          {t("onboarding.start.old")}
        </button>
      </div>
    </div>
  );
}

function PrimaryCTA({
  isConnected,
  isConnecting,
  isMiniPay,
  isWrongChain,
  isSwitchingChain,
  username,
  lastRunAt,
  hasActiveRun,
  env,
  connect,
  switchToCelo,
}: {
  isConnected: boolean;
  isConnecting: boolean;
  isMiniPay: boolean;
  isWrongChain: boolean;
  isSwitchingChain: boolean;
  username: string | null;
  lastRunAt: string | null;
  hasActiveRun: boolean;
  env: WalletEnvironment;
  connect: () => void;
  switchToCelo: () => void;
}) {
  const { t } = useLocale();

  const showAutoSpinner =
    isConnecting && (env === "minipay" || env === "farcaster" || isMiniPay);
  if (showAutoSpinner) {
    return <p className="text-sm text-zinc-500">{t("home.cta.signingIn")}</p>;
  }

  if (!isConnected) {
    if (isMiniPay || env === "minipay") {
      return (
        <p className="text-sm text-zinc-700">
          {t("home.env.minipay.connecting")}
        </p>
      );
    }
    if (env === "telegram-webview") {
      return <TelegramBrowserBlock />;
    }
    if (env === "mobile-no-wallet" || env === "desktop-no-wallet") {
      return <NoWalletBlock isMobile={env === "mobile-no-wallet"} />;
    }
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <button
          onClick={connect}
          className="mk-btn mk-btn-ink w-full px-6"
        >
          {t("home.cta.signIn")}
        </button>
        <MovementModes />
      </div>
    );
  }

  if (isWrongChain) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-5 py-4">
        <p className="text-sm text-amber-900">
          {isSwitchingChain
            ? t("home.cta.switching")
            : t("home.cta.wrongNetwork")}
        </p>
        <button
          onClick={switchToCelo}
          disabled={isSwitchingChain}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {t("home.cta.switchChain")}
        </button>
      </div>
    );
  }

  if (!username) {
    // Capture first, name after. The name used to be a gate on another
    // screen: of 1,576 players who picked one in 14 days, 720 never opened
    // the map (PostHog, to 23 Nov 2026). The first block is the reason to
    // want a name on it, so the block comes first.
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <Link
          href="/run"
          className="mk-btn min-h-14 w-full px-6 text-[1.375rem]"
        >
          {t("home.cta.start")}
        </Link>
        <Link
          href="/me"
          className="py-1 text-sm font-semibold text-orange-700 underline"
        >
          {t("home.cta.nameLater")}
        </Link>
        <LinkExisting />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <Link href="/run" className="mk-btn min-h-14 w-full px-6 text-[1.375rem]">
        {hasActiveRun ? t("home.cta.continue") : t("home.cta.start")}
      </Link>
      <ReturnNote lastRunAt={lastRunAt} hasActiveRun={hasActiveRun} />
    </div>
  );
}

function TelegramBrowserBlock() {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-5 py-4 text-center">
      <p className="text-base font-semibold text-amber-900">
        {t("home.env.telegram.h")}
      </p>
      <p className="text-xs text-amber-900">{t("home.env.telegram.body")}</p>
      <button
        onClick={copy}
        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
      >
        {copied ? t("home.env.telegram.copied") : t("home.env.telegram.copy")}
      </button>
    </div>
  );
}

function NoWalletBlock({ isMobile }: { isMobile: boolean }) {
  const { t } = useLocale();
  const host =
    typeof window !== "undefined"
      ? `${window.location.host}${window.location.pathname}`
      : "www.miniklaim.fun";
  const mmDeepLink = `https://metamask.app.link/dapp/${host}`;
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <p className="text-base font-semibold text-zinc-900">
        {t("home.env.noWallet.h")}
      </p>
      <p className="text-xs text-zinc-700">{t("home.env.noWallet.body")}</p>
      {isMobile && (
        <a
          href={mmDeepLink}
          className="mk-btn mk-btn-sm px-6"
        >
          {t("home.env.noWallet.openMm")}
        </a>
      )}
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-zinc-500 underline hover:text-zinc-700"
      >
        {t("home.env.noWallet.installMm")}
      </a>
      {isMobile && (
        <p className="text-xs text-zinc-500">
          {t("home.env.noWallet.minipay")}
        </p>
      )}
    </div>
  );
}
