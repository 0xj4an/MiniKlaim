import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { dropFinds } from "@/lib/db/schema";
import { approveAmount, readEntryFunds } from "@/lib/challenges/allowance";
import { challengeEntriesPaused } from "@/lib/challenges/paused";
import { qualifiedCount } from "@/lib/challenges/qualifiedCount";
import {
  challengeDepositAddress,
  currentChallenge,
  hasEntered,
  previousChallenge,
  viewOf,
} from "@/lib/challenges/server";
import {
  DROP_TOKENS,
  dropsAddress,
  dropTokenByAddress,
} from "@/lib/drops/config";
import { createLogger } from "@/lib/logger";
import {
  badgeProgress,
  computeBadgeStats,
  eligibleFromStats,
} from "@/lib/onchain/badgeEligibility";
import { onchainBadgeIdsHeldOrThrow } from "@/lib/onchain/badges";
import { ownerNameMap } from "@/lib/ownerNames";
import { addressesForPlayer } from "@/lib/players";

type Result = { winners?: string[]; perWinner?: string } | null;

/** Where a winner's prize stands: not paid out yet, ready, sent, or in the wallet. */
async function prizeState(
  dropId: string | null,
  linked: string[],
): Promise<"unpaid" | "claimable" | "pending" | "claimed"> {
  if (!dropId) return "unpaid";
  const rows = await db
    .select({ claimTx: dropFinds.claimTx, claimedAt: dropFinds.claimedAt })
    .from(dropFinds)
    .where(and(eq(dropFinds.dropId, dropId), inArray(dropFinds.player, linked)));
  if (rows.length === 0) return "unpaid";
  if (rows.every((r) => r.claimedAt)) return "claimed";
  if (rows.some((r) => r.claimTx && !r.claimedAt)) return "pending";
  return "claimable";
}

const log = createLogger("api:challenges:current");

export const dynamic = "force-dynamic";

/**
 * The challenge to show now, and with `?address=` where this player stands:
 * entered or not, which of its badges they hold onchain, and which they have
 * earned but not claimed (they only count once minted).
 */
export async function GET(request: Request) {
  const raw =
    new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
  const address = /^0x[a-f0-9]{40}$/.test(raw) ? raw : null;
  try {
    const now = new Date();
    const c = await currentChallenge(db, now);
    if (!c) return NextResponse.json({ challenge: null });
    // Only a live challenge has a "previous" to show beside it; a closed one
    // shows its own result.
    const live = c.closesAt.getTime() > now.getTime();
    const prev = live ? await previousChallenge(db, now, c.id) : null;
    const [view, qualified, prevView] = await Promise.all([
      viewOf(db, c),
      qualifiedCount(db, c),
      prev ? viewOf(db, prev) : Promise.resolve(null),
    ]);
    const prevWinners = ((prev?.result as Result)?.winners ?? []).map((w) =>
      w.toLowerCase(),
    );
    const names = prevWinners.length
      ? await ownerNameMap(prevWinners).catch(() => new Map<string, string | null>())
      : new Map<string, string | null>();
    const spender = dropsAddress();
    const sym = dropTokenByAddress(c.token);
    const token = sym ? DROP_TOKENS[sym] : null;
    const body: Record<string, unknown> = {
      // `qualified`: entrants holding every badge right now; null if unknown.
      challenge: { ...view, qualified },
      deposit: challengeDepositAddress(),
      spender,
      approveAmount: token ? approveAmount(token.decimals).toString() : null,
      entriesPaused: challengeEntriesPaused(),
      // Last week's result, for everyone: who won and how much.
      previous: prevView
        ? {
            ...prevView,
            winnerNames: prevWinners.map((a) => ({ address: a, name: names.get(a) ?? null })),
          }
        : null,
    };
    if (address) {
      const linked = await addressesForPlayer(address);
      // `heldKnown` false: the chain could not be read. The card then says
      // nothing about being in or out of the draw, instead of telling a
      // player who holds every badge that they are missing all of them.
      const [heldRead, stats] = await Promise.all([
        Promise.all(
          linked.map((w) => onchainBadgeIdsHeldOrThrow(w as Address)),
        ).then(
          (lists) => Array.from(new Set(lists.flat())),
          () => null,
        ),
        computeBadgeStats(address as Address).catch(() => null),
      ]);
      const eligible = stats ? eligibleFromStats(stats) : [];
      const held = heldRead ?? [];
      const wanted = new Set(c.badgeIds);
      const heldHere = held.filter((id) => wanted.has(id));
      const claimable = eligible
        .map(Number)
        .filter((id) => wanted.has(id) && !heldHere.includes(id));
      const funds = spender
        ? await readEntryFunds(
            c.token as Address,
            address as Address,
            spender,
          ).catch(() => null)
        : null;
      let previous: Record<string, unknown> | null = null;
      if (prev) {
        const enteredPrev = await hasEntered(db, prev.id, linked);
        const wonPrev = linked.some((w) => prevWinners.includes(w.toLowerCase()));
        previous = {
          entered: enteredPrev,
          won: wonPrev,
          prize: wonPrev ? await prizeState(prev.dropId, linked) : null,
        };
      }
      body.player = {
        entered: await hasEntered(db, c.id, linked),
        // How far along each badge of this challenge the player is.
        progress: stats ? badgeProgress(stats, c.badgeIds) : [],
        previous,
        held: heldHere,
        heldKnown: heldRead !== null,
        claimable,
        allowance: funds ? funds.allowance.toString() : null,
        balance: funds ? funds.balance.toString() : null,
      };
    }
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    log.error("current challenge failed", {
      error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    });
    return NextResponse.json({ challenge: null }, { status: 500 });
  }
}
