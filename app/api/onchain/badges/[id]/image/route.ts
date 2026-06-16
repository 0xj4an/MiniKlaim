import { BADGE_META, badgeSvg } from "@/lib/onchain/badgeArt";

/** Renders the badge medallion as an SVG (the on-chain token image). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const n = Number(id);
  if (!BADGE_META[n]) {
    return new Response("not found", { status: 404 });
  }
  return new Response(badgeSvg(n), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
