import farcasterMiniApp from "@farcaster/miniapp-wagmi-connector";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { celo, soneium } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Multichain: Celo (MiniPay / Farcaster) + Soneium (Startale). The active chain
// is fixed by the runtime environment (no in-app chain switching).
//
// Connector order matters: Farcaster comes first so its auto-connect runs
// before the cookie-restored injected one when both are present. Outside
// Farcaster the connector is a no-op and the injected fallback takes over.
// The Startale connector is added in the Startale host (see Phase D wiring).
export const wagmiConfig = createConfig({
  chains: [celo, soneium],
  connectors: [farcasterMiniApp(), injected()],
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
