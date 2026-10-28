import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import "./globals.css";
import { wagmiConfig } from "@/lib/wallet/config";
import dynamic from "next/dynamic";
import { Providers } from "./providers";
import { LogoMark } from "./Logo";
import { serverT } from "@/lib/i18nServer";
import { MAINTENANCE } from "@/lib/maintenance";

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
  themeColor: "#FF6B35",
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
      <html lang="en" style={{ colorScheme: "light" }}>
        <body className="bg-white text-zinc-900">
          <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
            <LogoMark size={72} />
            <h1 className="text-2xl font-bold text-zinc-900">
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
    <html lang="en" style={{ colorScheme: "light" }}>
      <body className="bg-white text-zinc-900">
        <Providers initialState={initialState}>
          <FarcasterReady />
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
