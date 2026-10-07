"use client";

import * as Sentry from "@sentry/nextjs";
import { useAccount, useChainId } from "wagmi";
import { useEffect } from "react";

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

  return null;
}
