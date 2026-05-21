"use client";

import Link from "next/link";
import { useState } from "react";
import { useFirstVisit } from "@/lib/useFirstVisit";
import { useGlobalStats } from "@/lib/useGlobalStats";
import { useLocale } from "@/lib/i18n";
import { useActiveRun } from "@/lib/wallet/useActiveRun";
import {
  type WalletEnvironment,
  useWalletEnvironment,
} from "@/lib/wallet/environment";
import { useUser } from "@/lib/wallet/useUser";
import { useWallet } from "@/lib/wallet/useWallet";

export default function HomePage() {
  const {
    address,
    isConnected,
    isConnecting,
    isMiniPay,
    isWrongChain,
    isSwitchingChain,
    chainId,
    connect,
    switchToCelo,
  } = useWallet();

  const { user } = useUser(isConnected ? address : null);
  const { active: activeRun } = useActiveRun(
    isConnected && !isWrongChain ? address : null,
  );
  const globalStats = useGlobalStats();
  const { showOnboarding, dismiss } = useFirstVisit();
  const { locale, setLocale, t } = useLocale();
  const env = useWalletEnvironment();

  return (
    <main className="flex min-h-screen flex-col items-center justify-between px-6 py-12">
      {showOnboarding && <OnboardingModal onClose={dismiss} />}
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-5xl font-bold">MiniKlaim</h1>
          <p className="text-lg text-zinc-700">{t("home.tagline")}</p>
        </div>

        <p className="text-xs text-zinc-400">
          {globalStats ? (
            <>
              <span className="font-semibold text-zinc-600">
                {globalStats.totalHexes}
              </span>{" "}
              {t("home.stats.blocks")} ·{" "}
              <span className="font-semibold text-zinc-600">
                {globalStats.totalPlayers}
              </span>{" "}
              {globalStats.totalPlayers === 1
                ? t("home.stats.player")
                : t("home.stats.players")}
            </>
          ) : (
            <span className="opacity-0">.</span>
          )}
        </p>

        <PrimaryCTA
          isConnected={isConnected}
          isConnecting={isConnecting}
          isMiniPay={isMiniPay}
          isWrongChain={isWrongChain}
          isSwitchingChain={isSwitchingChain}
          chainId={chainId}
          username={user?.username ?? null}
          hasActiveRun={activeRun !== null}
          env={env}
          connect={connect}
          switchToCelo={switchToCelo}
        />
      </div>

      <nav className="flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
        {isConnected && (
          <Link href="/me" className="underline hover:text-zinc-700">
            {t("nav.you")}
          </Link>
        )}
        <Link href="/community" className="underline hover:text-zinc-700">
          {t("nav.community")}
        </Link>
        <Link href="/about" className="underline hover:text-zinc-700">
          {t("nav.help")}
        </Link>
        <button
          onClick={() => setLocale(locale === "en" ? "es" : "en")}
          className="underline hover:text-zinc-700"
        >
          {t("locale.toggle")}
        </button>
      </nav>
    </main>
  );
}

function OnboardingModal({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-6 flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-2xl font-bold">
          {t("onboarding.title")}
        </h2>
        <ol className="flex flex-col gap-3 text-sm text-zinc-700">
          <li className="flex gap-3">
            <span className="font-mono text-zinc-400">1.</span>
            <span>
              <span className="font-semibold text-zinc-900">
                {t("onboarding.step1.title")}.
              </span>{" "}
              {t("onboarding.step1.body")}
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-zinc-400">2.</span>
            <span>
              <span className="font-semibold text-zinc-900">
                {t("onboarding.step2.title")}.
              </span>{" "}
              {t("onboarding.step2.body")}
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-zinc-400">3.</span>
            <span>
              <span className="font-semibold text-zinc-900">
                {t("onboarding.step3.title")}.
              </span>{" "}
              {t("onboarding.step3.body")}
            </span>
          </li>
        </ol>
        <button
          onClick={onClose}
          className="mt-2 rounded-full bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          {t("onboarding.start")}
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
  chainId,
  username,
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
  chainId: number | null;
  username: string | null;
  hasActiveRun: boolean;
  env: WalletEnvironment;
  connect: () => void;
  switchToCelo: () => void;
}) {
  const { t } = useLocale();

  if (isConnecting) {
    return <p className="text-sm text-zinc-500">{t("home.cta.signingIn")}</p>;
  }

  if (!isConnected) {
    if (isMiniPay || env === "minipay") {
      return (
        <p className="text-sm text-zinc-700">{t("home.env.minipay.connecting")}</p>
      );
    }
    if (env === "telegram-webview") {
      return <TelegramBrowserBlock />;
    }
    if (env === "mobile-no-wallet" || env === "desktop-no-wallet") {
      return <NoWalletBlock isMobile={env === "mobile-no-wallet"} />;
    }
    // env === "browser-wallet" or "unknown" (still detecting)
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={connect}
          className="rounded-full bg-zinc-900 px-8 py-4 text-lg font-semibold text-white hover:bg-zinc-800"
        >
          {t("home.cta.signIn")}
        </button>
      </div>
    );
  }

  if (isWrongChain) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-5 py-4">
        <p className="text-sm text-amber-900">
          {isSwitchingChain
            ? t("home.cta.switching")
            : `Chain ${chainId}. Switching to Celo...`}
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
    return (
      <div className="flex flex-col items-center gap-3">
        <Link
          href="/me"
          className="rounded-full bg-orange-500 px-8 py-4 text-lg font-semibold text-white shadow-md hover:bg-orange-600"
        >
          {t("home.cta.pickName")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-zinc-600">
        {t("home.hey")}{" "}
        <span className="font-semibold text-zinc-900">@{username}</span>
      </p>
      <Link
        href="/run"
        className={`rounded-full px-8 py-4 text-lg font-semibold text-white shadow-md ${
          hasActiveRun
            ? "bg-red-600 hover:bg-red-700"
            : "bg-orange-500 hover:bg-orange-600"
        }`}
      >
        {hasActiveRun ? `${t("home.cta.continue")} →` : t("home.cta.start")}
      </Link>
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
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-5 py-4 text-center">
      <p className="text-base font-semibold text-zinc-900">
        {t("home.env.noWallet.h")}
      </p>
      <p className="text-xs text-zinc-700">{t("home.env.noWallet.body")}</p>
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
      >
        {t("home.env.noWallet.installMm")}
      </a>
      {isMobile && (
        <p className="text-xs text-zinc-500">{t("home.env.noWallet.minipay")}</p>
      )}
    </div>
  );
}
