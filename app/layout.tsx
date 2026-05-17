import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MiniKlaim",
  description: "Run it. Klaim it.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
