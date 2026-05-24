import { NextResponse } from "next/server";

const DEFAULT_TEXT =
  "Run your city, capture territory on-chain. Try MiniKlaim";
const DEFAULT_EMBED = "https://www.miniklaim.fun";

// Public share entrypoint. Farcaster's Mini App `castShareUrl` requires the
// URL to live on the app's own domain, so we host this lightweight redirect
// that forwards into Warpcast's compose intent. Optional `?text=` and
// `?embed=` overrides let other surfaces (e.g. the /run share button) reuse
// this endpoint without hardcoding warpcast URLs.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = url.searchParams.get("text") ?? DEFAULT_TEXT;
  const embed = url.searchParams.get("embed") ?? DEFAULT_EMBED;

  const intent = `https://warpcast.com/~/compose?text=${encodeURIComponent(
    text,
  )}&embeds[]=${encodeURIComponent(embed)}`;

  return NextResponse.redirect(intent, 302);
}
