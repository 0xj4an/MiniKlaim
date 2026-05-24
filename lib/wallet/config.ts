import farcasterMiniApp from "@farcaster/miniapp-wagmi-connector";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { celo } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Connector order matters: Farcaster comes first so its auto-connect runs
// before the cookie-restored injected one when both are present. Outside
// Farcaster the connector is a no-op and the injected fallback takes over.
export const wagmiConfig = createConfig({
  chains: [celo],
  connectors: [farcasterMiniApp(), injected()],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [celo.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
