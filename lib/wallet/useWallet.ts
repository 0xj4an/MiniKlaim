"use client";

import { useEffect, useState } from "react";
import { useAccount, useAccountEffect, useConnect, useDisconnect } from "wagmi";
import { createLogger } from "@/lib/logger";
import { isMiniPay } from "@/lib/minipay";

const log = createLogger("wallet:useWallet");

export type UseWallet = {
  address: `0x${string}` | null;
  isConnected: boolean;
  isConnecting: boolean;
  isMiniPay: boolean;
  connect: () => void;
  disconnect: () => void;
};

export function useWallet(): UseWallet {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const {
    connect: wagmiConnect,
    connectors,
    isPending: isConnectPending,
    error: connectError,
  } = useConnect();
  const { disconnectAsync: wagmiDisconnectAsync } = useDisconnect();
  const [inMiniPay, setInMiniPay] = useState(false);

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

  function connectInjected() {
    const injected = connectors.find((c) => c.type === "injected");
    if (!injected) {
      log.warn("no injected connector for manual connect");
      return;
    }
    log.info("manual connect requested");
    wagmiConnect({ connector: injected });
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
    connect: connectInjected,
    disconnect,
  };
}
