import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();

  const [user] = await db
    .select({
      address: users.address,
      username: users.username,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.address, lower))
    .limit(1);

  return NextResponse.json({ user: user ?? null });
}
