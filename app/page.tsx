"use client";

import Link from "next/link";
import { type Balance, useBalances } from "@/lib/wallet/useBalances";
import { useWallet } from "@/lib/wallet/useWallet";
import { type TokenSymbol } from "@/lib/tokens";

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
    disconnect,
    switchToCelo,
  } = useWallet();

  const balances = useBalances(address, isConnected && !isWrongChain);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">MiniKlaim</h1>
      <p className="text-lg text-zinc-600">Run it. Klaim it.</p>

      {isConnecting && <p className="text-sm text-zinc-500">Connecting...</p>}

      {isConnected && address && (
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm text-zinc-700">Connected</p>
          <p className="font-mono text-xs text-zinc-400">
            {address.slice(0, 6)}...{address.slice(-4)}
          </p>
          <p className="text-xs text-zinc-400">(phone resolution pending)</p>

          {isWrongChain && (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-900">
                Wrong network. Currently on chain {chainId}, MiniKlaim runs on
                Celo (42220).
              </p>
              <button
                onClick={switchToCelo}
                disabled={isSwitchingChain}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isSwitchingChain ? "Switching..." : "Switch to Celo"}
              </button>
            </div>
          )}

          {!isWrongChain && (
            <div className="mt-3 flex min-w-[200px] flex-col items-stretch gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-xs">
              <p className="mb-1 text-center text-[10px] tracking-wide text-zinc-500 uppercase">
                Balances
              </p>
              {balances.isLoading ? (
                <p className="text-center text-zinc-400">Loading...</p>
              ) : balances.isError ? (
                <p className="text-center text-red-600">
                  Failed to load balances
                </p>
              ) : (
                <>
                  <BalanceRow symbol="USDm" balance={balances.USDm} />
                  <BalanceRow symbol="USDC" balance={balances.USDC} />
                  <BalanceRow symbol="USDT" balance={balances.USDT} />
                </>
              )}
            </div>
          )}

          {!isWrongChain && (
            <Link
              href="/run"
              className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Start Run
            </Link>
          )}

          {!isMiniPay && (
            <button
              onClick={disconnect}
              className="mt-2 text-xs text-zinc-500 underline"
            >
              Disconnect
            </button>
          )}
        </div>
      )}

      {!isConnected && !isConnecting && (
        <div className="flex flex-col items-center gap-3">
          {!isMiniPay ? (
            <>
              <button
                onClick={connect}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Connect Wallet
              </button>
              <p className="text-xs text-zinc-400">
                Running outside MiniPay. Will use any injected wallet (MetaMask,
                Rabby, MiniPay extension, etc.)
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-700">Connecting to MiniPay...</p>
          )}
          <a
            href="https://play.google.com/store/apps/details?id=com.opera.minipay"
            className="text-xs text-blue-600 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get MiniPay
          </a>
        </div>
      )}
    </main>
  );
}

function BalanceRow({
  symbol,
  balance,
}: {
  symbol: TokenSymbol;
  balance: Balance | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5 font-mono">
      <span className="text-zinc-600">{symbol}</span>
      <span className="text-zinc-900">
        {balance ? formatAmount(balance.formatted) : "..."}
      </span>
    </div>
  );
}

function formatAmount(formatted: string): string {
  const n = Number(formatted);
  if (!Number.isFinite(n)) return formatted;
  if (n === 0) return "0.00";
  if (n < 0.01) return "<0.01";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
