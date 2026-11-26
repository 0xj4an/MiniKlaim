import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { DRAIN_FLAG } from "@/lib/drain";

/**
 * Whether this container should get new requests. For Caddy's active health
 * check, not for people.
 *
 * A deploy replaces each container with `docker compose up`, which sends
 * SIGTERM, and Next stops listening and finishes what it holds. What it holds
 * is fine; what is lost is the request already on its way when the socket
 * closes, about one per deploy (24-26 Nov 2026, nine 502s, mostly GETs over
 * HTTP/3 that Caddy does not retry). ops/deploy.sh now drops a flag file in
 * the container first, this answers 503 while it is there, Caddy stops
 * routing here within its check interval, and only then is the container
 * replaced.
 *
 * Kept apart from /api/health on purpose: that one answers 503 when the
 * database is down, and an active check on it would take both containers out
 * of rotation at once, pages included, during any database outage.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const draining = existsSync(DRAIN_FLAG);
  return NextResponse.json(
    { ready: !draining },
    {
      status: draining ? 503 : 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
