import { NextResponse } from "next/server";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { getChain, parseChainKey } from "@/lib/onchain/chains";
import { requestHasOwnerKey } from "@/lib/ownerKey";
import { ensurePlayer } from "@/lib/players";
import { shortAddress } from "@/lib/shortAddress";

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

  // A wallet with no name yet may take one from any phone. Only changing a
  // name it already has asks for the owner key: the address alone let anyone
  // rename a player and take the name that freed up, and a name nobody holds
  // has nothing to take. Asking for the key on a first name too stopped real
  // players and protected no one: every blocked attempt in the 48 h to 17 Nov
  // 2026 (38 on 8 wallets) was a first name, on a wallet that had played
  // before the key existed and could not get one on a new phone.
  const [current] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.address, lower))
    .limit(1);
  const firstName = !current?.username;
  if (!firstName && !(await requestHasOwnerKey(request, lower))) {
    log.warn("username change without the owner key", { address: lower });
    return NextResponse.json(
      { error: "this phone cannot change this wallet's name", code: "proof-needed" },
      { status: 403 },
    );
  }

  // Ask before writing. The unique index is still the authority, and the
  // catch below handles the race, but the common case was being answered by
  // provoking a database error: 52 of them in 48 hours (11 Nov 2026), and
  // "already taken" told the player nothing about by whom. Many of those
  // players are the owner, on a second wallet.
  const taken = await takenBy(username, lower);
  if (taken) return taken;

  try {
    const [user] = await db
      .insert(users)
      .values({ address: lower, username })
      .onConflictDoUpdate({
        target: users.address,
        set: { username },
        // A first name goes through without the key only while the wallet
        // still has none, so a second keyless request cannot replace it.
        ...(firstName ? { setWhere: isNull(users.username) } : {}),
      })
      .returning({
        address: users.address,
        username: users.username,
        createdAt: users.createdAt,
      });
    if (!user) {
      // Another request named the wallet between the read and the write.
      return NextResponse.json(
        { error: "this phone cannot change this wallet's name", code: "proof-needed" },
        { status: 403 },
      );
    }

    // Ensure this wallet has a player so its name is linkable across chains.
    const chainId = getChain(
      parseChainKey(new URL(request.url).searchParams.get("chain")),
    ).chainId;
    await ensurePlayer(lower, chainId);

    log.info("username set", { address: lower, username });
    return NextResponse.json({ user });
  } catch (e) {
    // postgres-js sometimes nests the underlying error in .cause and the
    // pg error code lives on the original. Try every reasonable shape.
    const detail = extractDbError(e);
    if (
      detail.code === "23505" ||
      detail.message.includes("users_username_unique") ||
      detail.constraint.includes("username")
    ) {
      log.warn("username taken", { username, constraint: detail.constraint });
      return (
        (await takenBy(username, lower)) ??
        NextResponse.json(
          { error: "username already taken", code: "taken" },
          { status: 409 },
        )
      );
    }
    log.error("username set failed", {
      address: lower,
      username,
      ...detail,
    });
    return NextResponse.json(
      {
        error: `db ${detail.code || "??"} ${detail.detailLine || detail.message}`.slice(
          0,
          200,
        ),
      },
      { status: 500 },
    );
  }
}

/**
 * A 409 naming the wallet that holds `username`, shortened, or null when
 * the name is free or already belongs to the wallet asking.
 */
async function takenBy(username: string, asking: string) {
  const [holder] = await db
    .select({ address: users.address })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!holder || holder.address === asking) return null;
  return NextResponse.json(
    {
      error: "username already taken",
      code: "taken",
      owner: shortAddress(holder.address),
    },
    { status: 409 },
  );
}

type ErrShape = {
  code?: string;
  severity?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
  message?: string;
  cause?: unknown;
};

function extractDbError(e: unknown): {
  code: string;
  severity: string;
  constraint: string;
  table: string;
  column: string;
  message: string;
  detailLine: string;
} {
  let err = e as ErrShape;
  // Unwrap one level of cause if the outer has no code.
  if (!err.code && err.cause) err = err.cause as ErrShape;
  return {
    code: err.code ?? "",
    severity: err.severity ?? "",
    constraint: err.constraint ?? "",
    table: err.table ?? "",
    column: err.column ?? "",
    message: err.message ?? String(e),
    detailLine: err.detail ?? "",
  };
}
