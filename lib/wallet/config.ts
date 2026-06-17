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
export const wagmiConfig = createConfig({
  chains: [celo, soneium],
  connectors: [startaleConnector(), farcasterMiniApp(), injected()],
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
