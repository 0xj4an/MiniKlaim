"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { type State, WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wallet/config";
import { PostHogProvider } from "@/app/PostHogProvider";
import { SentryContext } from "@/app/SentryContext";

export function Providers({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: State;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <PostHogProvider />
        <SentryContext />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
