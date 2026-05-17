"use client";

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
    disconnect,
    switchToCelo,
  } = useWallet();

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
