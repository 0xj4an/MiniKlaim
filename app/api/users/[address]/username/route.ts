import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:users:username");

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(lower)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  const body = (await request.json()) as { username?: string };
  const username = body.username?.toLowerCase().trim();

  if (!username || !USERNAME_RE.test(username)) {
    return NextResponse.json(
      {
        error:
          "username must be 3-20 chars: lowercase letters, digits, underscore",
      },
      { status: 400 },
    );
  }

  try {
    const [user] = await db
      .insert(users)
      .values({ address: lower, username })
      .onConflictDoUpdate({
        target: users.address,
        set: { username },
      })
      .returning({
        address: users.address,
        username: users.username,
        createdAt: users.createdAt,
      });

    log.info("username set", { address: lower, username });
    return NextResponse.json({ user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("users_username_unique")) {
      log.warn("username taken", { username });
      return NextResponse.json(
        { error: "username already taken" },
        { status: 409 },
      );
    }
    log.error("username set failed", { error: msg });
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
