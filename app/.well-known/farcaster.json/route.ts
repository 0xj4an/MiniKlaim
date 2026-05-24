import { NextResponse } from "next/server";

// Farcaster Mini App manifest. Spec: https://miniapps.farcaster.xyz/
// The `accountAssociation` block is appended via env vars once the founder
// signs the manifest with their Farcaster FID (one-time, off-chain).
export async function GET() {
  return NextResponse.json({
    accountAssociation: process.env.FARCASTER_ACCOUNT_ASSOCIATION
      ? JSON.parse(process.env.FARCASTER_ACCOUNT_ASSOCIATION)
      : undefined,
    frame: {
      name: "MiniKlaim",
      version: "1",
      iconUrl: "https://www.miniklaim.fun/icon2",
      homeUrl: "https://www.miniklaim.fun",
      imageUrl: "https://www.miniklaim.fun/opengraph-image",
      buttonTitle: "Start running",
      splashImageUrl: "https://www.miniklaim.fun/splash.png",
      splashBackgroundColor: "#FF6B35",
      webhookUrl: "https://www.miniklaim.fun/api/webhook",
      subtitle: "Run it. Klaim it.",
      description:
        "Run or walk through real-world hexes to capture them as on-chain NFTs on Celo. MiniPay native, bilingual EN/ES.",
      primaryCategory: "games",
      tags: ["running", "fitness", "territory", "celo"],
      tagline: "Run your city. Capture turf.",
      ogTitle: "MiniKlaim - Run your city",
      ogDescription:
        "Walk or run through hex blocks to capture them as NFTs on Celo.",
      ogImageUrl: "https://www.miniklaim.fun/opengraph-image",
      castShareUrl:
        "https://warpcast.com/~/compose?text=Run+your+city%2C+capture+territory+on-chain.+Try+MiniKlaim&embeds[]=https://www.miniklaim.fun",
    },
  });
}
