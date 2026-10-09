"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { useAccount, useChainId } from "wagmi";
import { clientWalletHost } from "@/lib/client/walletHost";

export function SentryContext() {
  const { address } = useAccount();
  const chainId = useChainId();

  useEffect(() => {
    if (address) {
      Sentry.setUser({ id: address });
      Sentry.setTag("wallet_address", address);
    } else {
      Sentry.setUser(null);
      Sentry.setTag("wallet_address", null);
    }
  }, [address]);

  useEffect(() => {
    Sentry.setContext("chain", { chainId });
    Sentry.setTag("chain_id", chainId);
  }, [chainId]);

  useEffect(() => {
    Sentry.setTag("wallet_host", clientWalletHost());
  }, []);

  return null;
}
