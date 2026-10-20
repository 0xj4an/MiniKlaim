import farcasterMiniApp from "@farcaster/miniapp-wagmi-connector";
import { startaleConnector } from "@startale/app-sdk";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { celo, soneium } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Multichain: Celo (MiniPay / Farcaster) + Soneium (Startale). The active chain
// is fixed by the runtime environment (no in-app chain switching).
//
// Connector order matters: host-specific connectors (Startale, Farcaster) come
// first so their auto-connect runs before the cookie-restored injected one when
// present. Outside their host each is a no-op and the injected fallback (MiniPay
// / browser wallet) takes over.
//
// MiniPay is never a Startale host, and the Startale SDK opens IndexedDB as it
// starts. Old Android WebViews in MiniPay fail that open and the rejection
// surfaced as an app error (MINIKLAIM-10, -K). Leave it out there.
const inMiniPay =
  typeof window !== "undefined" &&
  (window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay === true;

export const wagmiConfig = createConfig({
  chains: [celo, soneium],
  connectors: [
    ...(inMiniPay ? [] : [startaleConnector()]),
    farcasterMiniApp(),
    injected(),
  ],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [celo.id]: http(),
    [soneium.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
