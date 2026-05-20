import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import "./globals.css";
import { wagmiConfig } from "@/lib/wallet/config";
import { Providers } from "./providers";

export const metadata: Metadata = {
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#FF6B35",
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
    <html lang="en">
      <body>
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
