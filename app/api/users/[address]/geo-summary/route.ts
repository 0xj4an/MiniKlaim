import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { addressesForPlayer } from "@/lib/players";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();

  const linked = await addressesForPlayer(lower);

  const addressList = sql.join(
    linked.map((a) => sql`${a}`),
    sql`, `,
  );

  const [countryRows, cityRows] = await Promise.all([
    db.execute(sql`
      SELECT country, COUNT(*)::int AS count
      FROM hexes
      WHERE owner_address IN (${addressList})
        AND country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT country, city, COUNT(*)::int AS count
      FROM hexes
      WHERE owner_address IN (${addressList})
        AND country IS NOT NULL
        AND city IS NOT NULL
      GROUP BY country, city
      ORDER BY country, count DESC
    `),
  ]);

  return NextResponse.json({
    byCountry: countryRows,
    byCity: cityRows,
  });
}
