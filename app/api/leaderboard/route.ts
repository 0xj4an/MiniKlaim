import { NextResponse } from "next/server";
import { getLeaderboardTop, MAX_PAGE } from "@/lib/leaderboardPage";
import { getRanking } from "@/lib/leaderboardRanking";

export const dynamic = "force-dynamic";

/**
 * Rank by per-player aggregated hex count. Each user is grouped by their
 * `player_id` (via `player_wallets`) when linked, else by their own address
 * as a fallback. One row per group, using the group's primary wallet
 * address and its username (or any linked wallet's username, primary
 * first). Unlinked users behave exactly as before.
 *
 * Both the page and the pinned row are reads from a shared snapshot that is
 * rebuilt every 30 s in the background, so a request here does no database
 * work at all. lib/leaderboardPage.ts has the measurements.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "10");
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) ? limitParam : 10, 1),
    MAX_PAGE,
  );

  const meParam = url.searchParams.get("me")?.toLowerCase() ?? null;
  const me = meParam && /^0x[0-9a-f]{40}$/.test(meParam) ? meParam : null;

  const [top, ranking] = await Promise.all([getLeaderboardTop(), getRanking()]);

  let mine: {
    rank: number;
    address: string;
    username: string | null;
    hexCount: number;
  } | null = null;
  const myGroup = me ? ranking.groupOf.get(me) : undefined;
  const pinned = myGroup ? ranking.byGroup.get(myGroup) : undefined;
  if (pinned && pinned.hexCount > 0) {
    mine = {
      rank: pinned.rank,
      address: pinned.address,
      username: pinned.username,
      hexCount: pinned.hexCount,
    };
  }

  return NextResponse.json({ leaderboard: top.slice(0, limit), me: mine });
}
