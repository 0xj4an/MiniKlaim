import { eq } from "drizzle-orm";
import { cellToLatLng } from "h3-js";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes } from "@/lib/db/schema";
import { tokenIdToH3 } from "@/lib/onchain/hexes";

export const dynamic = "force-dynamic";

/**
 * ERC-721 metadata for a block. `MiniKlaimHexes.tokenURI(id)` returns
 * `<baseUri><id>`, which points here.
 *
 * The route did not exist until 13 Nov 2026. Indexers had been asking for it
 * all along: 8,413 requests in under five hours that day, every one a 404
 * that rendered the whole not-found page (p50 1.4 s), and no block showed a
 * name or a place in any wallet or marketplace.
 *
 * One read by primary key. A block we have never recorded is a 404, so the
 * route cannot be walked for ids that do not exist.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const h3 = tokenIdToH3(id);
  if (!h3) {
    return NextResponse.json({ error: "unknown block" }, { status: 404 });
  }
  const [row] = await db
    .select({ country: hexes.country, city: hexes.city })
    .from(hexes)
    .where(eq(hexes.h3Id, h3))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "unknown block" }, { status: 404 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.miniklaim.fun";
  const [lat, lng] = cellToLatLng(h3);
  const place = [row.city, row.country].filter(Boolean).join(", ");
  return NextResponse.json(
    {
      name: `MiniKlaim block ${h3}`,
      description: place
        ? `A block in ${place}, captured by moving through it in MiniKlaim, the territory game on Celo.`
        : "A block captured by moving through it in MiniKlaim, the territory game on Celo.",
      image: `${base}/opengraph-image`,
      external_url: base,
      attributes: [
        ...(row.country ? [{ trait_type: "Country", value: row.country }] : []),
        ...(row.city ? [{ trait_type: "City", value: row.city }] : []),
        { trait_type: "Latitude", value: lat.toFixed(5) },
        { trait_type: "Longitude", value: lng.toFixed(5) },
      ],
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
