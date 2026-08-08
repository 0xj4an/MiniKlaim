"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { type State, WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wallet/config";
import { PostHogProvider } from "@/app/PostHogProvider";

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
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
