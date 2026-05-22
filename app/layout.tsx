import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import "./globals.css";
import { wagmiConfig } from "@/lib/wallet/config";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://miniklaim.fun",
  ),
  title: "MiniKlaim",
  description: "Run it. Klaim it. A territory-capture running game on Celo.",
  openGraph: {
    title: "MiniKlaim",
    description: "Run it. Klaim it. A territory-capture running game on Celo.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MiniKlaim",
    description: "Run it. Klaim it.",
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

  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body className="bg-white text-zinc-900">
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
