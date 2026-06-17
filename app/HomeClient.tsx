"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFirstVisit } from "@/lib/useFirstVisit";
import { useGlobalStats } from "@/lib/useGlobalStats";
import { useLocale } from "@/lib/i18n";
import { useActiveRun } from "@/lib/wallet/useActiveRun";
import {
  type WalletEnvironment,
  useWalletEnvironment,
} from "@/lib/wallet/environment";
import { LinkExisting } from "@/app/LinkExisting";
import { useUser } from "@/lib/wallet/useUser";
import { useWallet } from "@/lib/wallet/useWallet";

export function HomeClient() {
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
  const { t } = useLocale();
  const env = useWalletEnvironment();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  return (
    <>
      {showOnboarding && <OnboardingModal onClose={dismiss} />}
      <p className="text-xs text-zinc-500">
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

      {mounted ? (
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
      ) : (
        <WelcomePlaceholder />
      )}

      {mounted && isConnected ? <YouNavLink /> : null}
    </>
  );
}

function YouNavLink() {
  const { t } = useLocale();
  return (
    <Link
      href="/me"
      className="-mt-4 text-xs text-zinc-500 underline hover:text-zinc-700"
    >
      {t("nav.you")}
    </Link>
  );
}

function WelcomePlaceholder() {
  return (
    <div
      className="h-12 w-44 rounded-full bg-zinc-100"
      aria-hidden="true"
    />
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
            <span className="font-mono text-zinc-500">1.</span>
            <span>
              <span className="font-semibold text-zinc-900">
                {t("onboarding.step1.title")}.
              </span>{" "}
              {t("onboarding.step1.body")}
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-zinc-500">2.</span>
            <span>
              <span className="font-semibold text-zinc-900">
                {t("onboarding.step2.title")}.
              </span>{" "}
              {t("onboarding.step2.body")}
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-zinc-500">3.</span>
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
          className="mt-2 rounded-full bg-orange-700 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-800"
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

  const showAutoSpinner =
    isConnecting && (env === "minipay" || env === "farcaster" || isMiniPay);
  if (showAutoSpinner) {
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
          className="rounded-full bg-orange-700 px-8 py-4 text-lg font-semibold text-white shadow-md hover:bg-orange-800"
        >
          {t("home.cta.pickName")}
        </Link>
        <LinkExisting />
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
            : "bg-orange-700 hover:bg-orange-800"
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
  const host =
    typeof window !== "undefined"
      ? `${window.location.host}${window.location.pathname}`
      : "www.miniklaim.fun";
  const mmDeepLink = `https://metamask.app.link/dapp/${host}`;
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-5 py-4 text-center">
      <p className="text-base font-semibold text-zinc-900">
        {t("home.env.noWallet.h")}
      </p>
      <p className="text-xs text-zinc-700">{t("home.env.noWallet.body")}</p>
      {isMobile && (
        <a
          href={mmDeepLink}
          className="rounded-full bg-orange-700 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-orange-800"
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
        <p className="text-xs text-zinc-500">{t("home.env.noWallet.minipay")}</p>
      )}
    </div>
  );
}
