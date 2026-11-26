import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { DRAIN_FLAG, readiness } from "@/lib/drain";
import { worldListWarm } from "@/lib/map/worldList";

/**
 * Whether this container should get new requests. For Caddy's active health
 * check, not for people.
 *
 * Not ready while a deploy is draining it (ops/deploy.sh drops a flag file
 * first, so requests stop arriving before SIGTERM), and not ready until the
 * world list is built, so a container fresh from a deploy is not handed the
 * map while it still has to read every block (15 to 22 s on 26 Nov 2026).
 * The second wait has a ceiling: a container that cannot build the list, say
 * with the database down, is still let in after `COLD_MAX_S`, so a bad start
 * never takes both containers out.
 *
 * Kept apart from /api/health on purpose: that one answers 503 when the
 * database is down, and an active check on it would take both containers out
 * of rotation at once, pages included, during any database outage.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const state = readiness({
    draining: existsSync(DRAIN_FLAG),
    warm: worldListWarm(),
    uptimeS: process.uptime(),
  });
  return NextResponse.json(state, {
    status: state.ready ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
