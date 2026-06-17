import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { getChain, parseChainKey } from "@/lib/onchain/chains";
import { ensurePlayer } from "@/lib/players";

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
      return NextResponse.json(
        { error: "username already taken" },
        { status: 409 },
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
