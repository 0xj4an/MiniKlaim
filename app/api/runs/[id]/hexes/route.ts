import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * The hexes a run currently holds. The run map uses it after a reload to
 * paint the run's captures red again. Hex ownership is public on the map
 * already, so this needs no auth.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid run" }, { status: 400 });
  }
  const rows = await db
    .select({ h3Id: hexes.h3Id })
    .from(hexes)
    .where(eq(hexes.runId, id))
    .limit(5000);
  return NextResponse.json({ h3Ids: rows.map((r) => r.h3Id) });
}
