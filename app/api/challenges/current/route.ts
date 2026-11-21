import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { approveAmount, readEntryFunds } from "@/lib/challenges/allowance";
import { challengeEntriesPaused } from "@/lib/challenges/paused";
import { qualifiedCount } from "@/lib/challenges/qualifiedCount";
import {
  challengeDepositAddress,
  currentChallenge,
  hasEntered,
  viewOf,
} from "@/lib/challenges/server";
import {
  DROP_TOKENS,
  dropsAddress,
  dropTokenByAddress,
} from "@/lib/drops/config";
import { createLogger } from "@/lib/logger";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { onchainBadgeIdsHeldOrThrow } from "@/lib/onchain/badges";
import { addressesForPlayer } from "@/lib/players";

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
    const c = await currentChallenge(db, new Date());
    if (!c) return NextResponse.json({ challenge: null });
    const [view, qualified] = await Promise.all([
      viewOf(db, c),
      qualifiedCount(db, c),
    ]);
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
    };
    if (address) {
      const linked = await addressesForPlayer(address);
      // `heldKnown` false: the chain could not be read. The card then says
      // nothing about being in or out of the draw, instead of telling a
      // player who holds every badge that they are missing all of them.
      const [heldRead, eligible] = await Promise.all([
        Promise.all(
          linked.map((w) => onchainBadgeIdsHeldOrThrow(w as Address)),
        ).then(
          (lists) => Array.from(new Set(lists.flat())),
          () => null,
        ),
        computeEligibleBadgeIds(address as Address).catch(() => [] as bigint[]),
      ]);
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
      body.player = {
        entered: await hasEntered(db, c.id, linked),
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
