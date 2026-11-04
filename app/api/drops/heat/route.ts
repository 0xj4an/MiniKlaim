import { eq } from "drizzle-orm";
import { getResolution, isValidCell } from "h3-js";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { isTreasuresEnabled } from "@/lib/drops/config";
import { activeDrops } from "@/lib/drops/detect";
import { heatFor, heatOrigin } from "@/lib/drops/heat";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:drops:heat");

export const dynamic = "force-dynamic";

const NONE = { level: 0 } as const;

/** One computed answer per run per window; faster polls get the cached one. */
const MIN_INTERVAL_MS = 10_000;
const recent = new Map<string, { at: number; body: object }>();

function phoneCell(raw: string | null): string | null {
  if (!raw || !isValidCell(raw)) return null;
  return getResolution(raw) === 12 ? raw : null;
}

/**
 * Hot/cold for an active run: 0-3 for the nearest open treasure. Judged from
 * the phone's current cell (`at`) when it is within 300 m of the run's last
 * guard-accepted block (runs.last_h3), so re-walking blocks already sent
 * still moves it; otherwise from last_h3. A cell far from the run is ignored,
 * so this cannot be asked about places the run has not reached. Only the
 * level and the treasure's public name and clue go out.
 */
export async function GET(request: Request) {
  if (!isTreasuresEnabled()) return NextResponse.json(NONE);
  const params = new URL(request.url).searchParams;
  const runId = params.get("runId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    return NextResponse.json({ error: "invalid runId" }, { status: 400 });
  }
  const cached = recent.get(runId);
  if (cached && Date.now() - cached.at < MIN_INTERVAL_MS) return NextResponse.json(cached.body);
  try {
    // Nothing open: answer without touching the runs table.
    const open = await activeDrops(db, new Date());
    if (open.length === 0) return NextResponse.json(NONE);
    const [run] = await db
      .select({ lastH3: runs.lastH3, endedAt: runs.endedAt })
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);
    if (!run || run.endedAt || !run.lastH3) return NextResponse.json(NONE);
    const origin = heatOrigin(run.lastH3, phoneCell(params.get("at")));
    const hit = heatFor(origin, open);
    const body = hit ? { level: hit.level, label: hit.drop.label, clue: hit.drop.clue } : NONE;
    if (recent.size > 5000) recent.clear();
    recent.set(runId, { at: Date.now(), body });
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    log.error("heat failed", {
      runId,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    });
    return NextResponse.json(NONE);
  }
}
