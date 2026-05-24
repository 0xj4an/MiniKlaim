"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useAccountEffect,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { celo } from "wagmi/chains";
import { createLogger } from "@/lib/logger";
import { isMiniPay } from "@/lib/minipay";

const log = createLogger("wallet:useWallet");

export type UseWallet = {
  address: `0x${string}` | null;
  isConnected: boolean;
  isConnecting: boolean;
  isMiniPay: boolean;
  chainId: number;
  isWrongChain: boolean;
  isSwitchingChain: boolean;
  connect: () => void;
  disconnect: () => void;
  switchToCelo: () => void;
};

export function useWallet(): UseWallet {
  const {
    address,
    chainId: accountChainId,
    isConnected,
    isConnecting,
    isReconnecting,
  } = useAccount();
  const {
    connect: wagmiConnect,
    connectors,
    isPending: isConnectPending,
    error: connectError,
  } = useConnect();
  const { disconnectAsync: wagmiDisconnectAsync } = useDisconnect();
  const wagmiChainId = useChainId();
  const {
    switchChain: wagmiSwitchChain,
    isPending: isSwitchingChain,
    error: switchError,
  } = useSwitchChain();
  const [inMiniPay, setInMiniPay] = useState(false);

  // `useAccount().chainId` reflects the active connection's actual chain,
  // even when that chain is not in the wagmi `chains` config. `useChainId()`
  // can fall back to the configured default. Prefer the account-level value.
  const chainId = accountChainId ?? wagmiChainId;
  const isWrongChain = isConnected && chainId !== celo.id;

  useAccountEffect({
    onConnect(data) {
      log.info("connected", {
        address: data.address,
        chainId: data.chainId,
        connector: data.connector.name,
      });
    },
    onDisconnect() {
      log.info("disconnected");
    },
  });

  useEffect(() => {
    if (!connectError) return;
    log.error("connect failed", {
      name: connectError.name,
      message: connectError.message,
    });
  }, [connectError]);

  useEffect(() => {
    if (!switchError) return;
    log.error("switch chain failed", {
      name: switchError.name,
      message: switchError.message,
    });
  }, [switchError]);

  useEffect(() => {
    if (!isConnected) return;
    log.debug("chain state", {
      accountChainId,
      wagmiChainId,
      resolved: chainId,
      expected: celo.id,
      isWrongChain,
    });
    if (isWrongChain) {
      log.warn("connected on wrong chain", {
        current: chainId,
        expected: celo.id,
      });
    }
  }, [isConnected, isWrongChain, chainId, accountChainId, wagmiChainId]);

  // Auto-switch to Celo whenever a connected wallet is on a different chain.
  // The user previously had to tap a "Switch to Celo" button. Now the request
  // fires immediately and the button is only shown if the wallet refuses.
  const [autoSwitchAttempted, setAutoSwitchAttempted] = useState(false);
  useEffect(() => {
    if (!isConnected || !isWrongChain || isSwitchingChain) return;
    if (autoSwitchAttempted) return;
    queueMicrotask(() => setAutoSwitchAttempted(true));
    log.info("auto-switching to Celo", { from: chainId });
    wagmiSwitchChain({ chainId: celo.id });
  }, [
    isConnected,
    isWrongChain,
    isSwitchingChain,
    autoSwitchAttempted,
    chainId,
    wagmiSwitchChain,
  ]);
  useEffect(() => {
    if (!isWrongChain) queueMicrotask(() => setAutoSwitchAttempted(false));
  }, [isWrongChain]);

  useEffect(() => {
    log.debug("available connectors", {
      count: connectors.length,
      ids: connectors.map((c) => c.id),
      types: connectors.map((c) => c.type),
    });
  }, [connectors]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const detected = isMiniPay();
      log.debug("MiniPay detection on mount", { detected });
      if (!cancelled) setInMiniPay(detected);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!inMiniPay || isConnected || isConnectPending) return;
    const injected = connectors.find((c) => c.type === "injected");
    if (!injected) {
      log.warn("no injected connector available for MiniPay auto-connect");
      return;
    }
    log.info("auto-connecting via MiniPay");
    wagmiConnect({ connector: injected });
  }, [inMiniPay, isConnected, isConnectPending, wagmiConnect, connectors]);

  // Auto-connect via Farcaster Mini App connector when running inside a
  // Farcaster host (Warpcast, dev preview tool, etc.). Asks the SDK and
  // only fires if it returns true.
  // Critical: bail if wagmi is mid-reconnect from cookie storage. Otherwise
  // both our explicit connect and wagmi's reconnect race and one hangs,
  // leaving the UI stuck on "Signing in..." in regular browsers (MetaMask
  // in-app, Safari, etc.) where Farcaster isn't actually present.
  useEffect(() => {
    if (isConnected || isConnectPending || isReconnecting) return;
    let cancelled = false;
    void (async () => {
      try {
        const mod = await import("@farcaster/miniapp-sdk");
        const inMiniApp = await mod.sdk.isInMiniApp();
        if (cancelled || !inMiniApp) return;
        const fc = connectors.find((c) => c.id === "farcasterMiniApp");
        if (!fc) {
          log.warn("farcaster connector missing in wagmi config");
          return;
        }
        log.info("auto-connecting via Farcaster");
        wagmiConnect({ connector: fc });
      } catch (e) {
        log.warn("farcaster auto-connect probe failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isConnected,
    isConnectPending,
    isReconnecting,
    wagmiConnect,
    connectors,
  ]);

  function connectInjected() {
    const injected = connectors.find((c) => c.type === "injected");
    if (!injected) {
      log.warn("no injected connector for manual connect");
      return;
    }
    log.info("manual connect requested");
    wagmiConnect({ connector: injected });
  }

  function switchToCelo() {
    log.info("switch to Celo requested", { from: chainId, to: celo.id });
    wagmiSwitchChain({ chainId: celo.id });
  }

  function disconnect() {
    log.info("disconnect requested");
    wagmiDisconnectAsync()
      .then(() => log.info("disconnect succeeded"))
      .catch((err: unknown) => {
        // Some wallets (e.g. Zerion) do not implement
        // wallet_revokePermissions and respond with -32601. wagmi clears
        // its local connection state anyway. Log and swallow.
        log.warn("disconnect raised an error from the wallet", {
          name: err instanceof Error ? err.name : "unknown",
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return {
    address: address ?? null,
    isConnected,
    isConnecting: isConnecting || isReconnecting || isConnectPending,
    isMiniPay: inMiniPay,
    chainId,
    isWrongChain,
    isSwitchingChain,
    connect: connectInjected,
    disconnect,
    switchToCelo,
  };
}
