import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { cookieToInitialState } from "wagmi";
import "./globals.css";
import { wagmiConfig } from "@/lib/wallet/config";
import dynamic from "next/dynamic";
import { Providers } from "./providers";
import { LogoMark } from "./Logo";
import { serverT } from "@/lib/i18nServer";
import { MAINTENANCE } from "@/lib/maintenance";

// The game's type: Barlow, drawn from road signs and licence plates, for a
// game played on streets. Three files, latin only, served from the app
// itself so the build needs no outside host. Only the condensed display
// weight is preloaded: it sets the numbers and the buttons, the largest
// text on every screen. The body falls back to the system font until it
// arrives, with matched metrics so nothing jumps.
const barlow = localFont({
  src: [
    { path: "./fonts/barlow-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/barlow-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-barlow",
  display: "swap",
  preload: false,
  fallback: ["system-ui", "Roboto", "Arial", "sans-serif"],
});
const barlowCondensed = localFont({
  src: [
    {
      path: "./fonts/barlow-condensed-800.woff2",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
  preload: true,
  fallback: ["Roboto Condensed", "Arial Narrow", "system-ui", "sans-serif"],
});
const FONTS = `${barlow.variable} ${barlowCondensed.variable}`;

// Non-critical client UI split into its own chunk so it doesn't sit on the
// home critical-path bundle. Each component is "use client" already so no
// SSR work happens for them. The language toggle used to be a separate
// floating widget; it now lives inside BottomNav (see there for rationale).
const FarcasterReady = dynamic(() =>
  import("./FarcasterReady").then((m) => m.FarcasterReady),
);
const BottomNav = dynamic(() =>
  import("./BottomNav").then((m) => m.BottomNav),
);

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.miniklaim.fun",
  ),
  title: "MiniKlaim",
  description:
    "Move through the city. Klaim the blocks. A territory-capture game on Celo.",
  openGraph: {
    title: "MiniKlaim",
    description:
      "Walk, bike, or drive. The blocks you cross are yours on Celo.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MiniKlaim",
    description: "Walk, bike, or drive. Klaim the blocks.",
  },
  other: {
    "talentapp:project_verification":
      "1ab9d6be6ebab071c11210474ceed66044004a2994d648f70d8e5b8d37836ef6da1de20f5b85048496de08da8297d276d31ad97334f88b05f2a919c5e9898ab8",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#E64A12",
  colorScheme: "light",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialState = cookieToInitialState(
    wagmiConfig,
    (await headers()).get("cookie"),
  );

  if (MAINTENANCE) {
    const { t } = await serverT();
    return (
      <html lang="en" className={FONTS} style={{ colorScheme: "light" }}>
        <body className="bg-zinc-100 text-zinc-900">
          <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
            <LogoMark size={72} />
            <h1 className="mk-title text-[1.75rem] text-zinc-900">
              {t("maintenance.title")}
            </h1>
            <p className="max-w-xs text-sm leading-relaxed text-zinc-600">
              {t("maintenance.body")}
            </p>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className={FONTS} style={{ colorScheme: "light" }}>
      <body className="bg-zinc-100 text-zinc-900">
        <Providers initialState={initialState}>
          <FarcasterReady />
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
