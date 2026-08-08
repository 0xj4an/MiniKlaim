import { NextResponse } from "next/server";

// Farcaster Mini App manifest. Spec: https://miniapps.farcaster.xyz/
// The `accountAssociation` block is the signed proof that this domain is
// owned by the founder's FID. It is generated once via Warpcast and is
// safe to commit (the signature only validates this exact domain payload).
export async function GET() {
  return NextResponse.json({
    accountAssociation: {
      header:
        "eyJmaWQiOjEzMTk0LCJ0eXBlIjoiY3VzdG9keSIsImtleSI6IjB4QTVFRTZiODQyQWZDQ2RBNzVGNDhmZjlhZmM3NjE3YzBiQ0UzNjEzNSJ9",
      payload: "eyJkb21haW4iOiJ3d3cubWluaWtsYWltLmZ1biJ9",
      signature:
        "OmVNxih8U+JcwVROYX6SS7jH1j38K+VN+ApZ3nYArOwRvrwuAfYjzsOG2ojeq2lE5/4fFT8bzxEY7KazWPmeZBs=",
    },
    frame: {
      name: "MiniKlaim",
      version: "1",
      iconUrl: "https://www.miniklaim.fun/icon-512.png",
      homeUrl: "https://www.miniklaim.fun",
      imageUrl: "https://www.miniklaim.fun/opengraph-image",
      buttonTitle: "Start playing",
      splashImageUrl: "https://www.miniklaim.fun/splash.png",
      splashBackgroundColor: "#FF6B35",
      webhookUrl: "https://www.miniklaim.fun/api/webhook",
      subtitle: "Run it. Klaim it.",
      description:
        "Move through real-world hexes — walk, run, bike, drive — and capture them as on-chain NFTs on Celo. MiniPay native, bilingual in English and Spanish.",
      primaryCategory: "games",
      screenshotUrls: ["https://www.miniklaim.fun/opengraph-image"],
      heroImageUrl: "https://www.miniklaim.fun/opengraph-image",
      tags: ["territory", "map", "movement", "celo"],
      tagline: "Run your city. Capture turf.",
      ogTitle: "MiniKlaim: Run your city",
      ogDescription:
        "Cross hex blocks in the real world — any way you move — to capture them as NFTs on Celo.",
      ogImageUrl: "https://www.miniklaim.fun/opengraph-image",
      castShareUrl: "https://www.miniklaim.fun/share",
    },
  });
}
