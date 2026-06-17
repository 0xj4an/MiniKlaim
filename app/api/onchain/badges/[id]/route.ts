import { NextResponse } from "next/server";
import { BADGE_META } from "@/lib/onchain/badgeArt";

/**
 * ERC-1155 metadata for a badge id. The contract's `uri(id)` resolves here, so
 * marketplaces and wallets read name/description/image from this endpoint.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const meta = BADGE_META[Number(id)];
  if (!meta) {
    return NextResponse.json({ error: "unknown badge" }, { status: 404 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.miniklaim.fun";
  return NextResponse.json(
    {
      name: meta.name,
      description: meta.description,
      image: `${base}/api/onchain/badges/${Number(id)}/image`,
      attributes: [{ trait_type: "Achievement", value: meta.name }],
    },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
