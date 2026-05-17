"use client";

import { useEffect, useState } from "react";
import { connectMiniPay, isMiniPay } from "@/lib/minipay";

type ConnectionState =
  | { status: "loading" }
  | { status: "no-minipay" }
  | { status: "connected"; address: string }
  | { status: "error"; message: string };

export default function HomePage() {
  const [state, setState] = useState<ConnectionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<ConnectionState> {
      if (!isMiniPay()) return { status: "no-minipay" };
      try {
        const address = await connectMiniPay();
        if (!address)
          return { status: "error", message: "No account returned" };
        return { status: "connected", address };
      } catch (err: unknown) {
        return {
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }

    run().then((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">MiniKlaim</h1>
      <p className="text-lg text-zinc-600">Run it. Klaim it.</p>

      {state.status === "loading" && (
        <p className="text-sm text-zinc-500">Connecting...</p>
      )}

      {state.status === "connected" && (
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm text-zinc-700">Connected</p>
          <p className="font-mono text-xs text-zinc-400">
            {state.address.slice(0, 6)}...{state.address.slice(-4)}
          </p>
          <p className="text-xs text-zinc-400">
            (phone resolution pending - dev placeholder)
          </p>
        </div>
      )}

      {state.status === "no-minipay" && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-zinc-700">Open this in MiniPay to play.</p>
          <a
            href="https://play.google.com/store/apps/details?id=com.opera.minipay"
            className="text-sm text-blue-600 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get MiniPay
          </a>
        </div>
      )}

      {state.status === "error" && (
        <p className="text-sm text-red-600">Error: {state.message}</p>
      )}
    </main>
  );
}
