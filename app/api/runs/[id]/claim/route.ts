import { eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";
import { countryForHex } from "@/lib/geo/country";
import { createLogger } from "@/lib/logger";
import { validateClaim } from "@/lib/runs/validation";

const log = createLogger("api:runs:claim");

export const dynamic = "force-dynamic";

/**
 * Claim one or more hexes for a run. Accepts two body shapes:
 *   - Legacy: { h3, distanceMeters?, accuracy? } — one hex per request.
 *   - Batch:  { hexes: [{ h3, distanceMeters?, accuracy? }, ...] } — one round
 *     trip per GPS ping, no matter how many hexes the player crossed in that
 *     interval (matters at car / bike / plane speed where a single ping may
 *     span 5-40 hexes).
 *
 * Response for batch:
 *   { ok: true, results: [{ h3, alreadyOwned?, rejected?: { reason, detail } }, ...] }
 * Response for legacy: preserved as { ok: true, alreadyOwned }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as {
    h3?: string;
    distanceMeters?: number;
    accuracy?: number;
    hexes?: Array<{ h3: string; distanceMeters?: number; accuracy?: number }>;
  };

  const items = Array.isArray(body.hexes)
    ? body.hexes
    : body.h3
      ? [{ h3: body.h3, distanceMeters: body.distanceMeters, accuracy: body.accuracy }]
      : [];

  if (items.length === 0) {
    return NextResponse.json({ error: "no hexes provided" }, { status: 400 });
  }

  const [run] = await db
    .select({
      id: runs.id,
      userAddress: runs.userAddress,
      endedAt: runs.endedAt,
    })
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (run.endedAt) {
    return NextResponse.json({ error: "run already ended" }, { status: 409 });
  }

  // Prefetch existing rows in a single query. Avoids N sequential SELECTs when
  // a plane-speed ping submits 30+ hexes at once.
  const h3Ids = Array.from(new Set(items.map((h) => h.h3).filter(Boolean)));
  const existingRows =
    h3Ids.length > 0
      ? await db
          .select({
            h3Id: hexes.h3Id,
            ownerAddress: hexes.ownerAddress,
            runId: hexes.runId,
          })
          .from(hexes)
          .where(inArray(hexes.h3Id, h3Ids))
      : [];
  const existingByH3 = new Map(existingRows.map((r) => [r.h3Id, r]));

  const results: Array<{
    h3: string;
    alreadyOwned?: boolean;
    rejected?: { reason: string; detail?: string };
  }> = [];
  let newlyCaptured = 0;
  let distanceDelta = 0;
  let conquestDelta = 0;

  for (const raw of items) {
    const h3 = raw.h3;
    if (!h3 || typeof h3 !== "string") {
      results.push({ h3: "", rejected: { reason: "invalid-h3" } });
      continue;
    }

    const distanceMeters =
      typeof raw.distanceMeters === "number" &&
      Number.isFinite(raw.distanceMeters) &&
      raw.distanceMeters > 0
        ? Math.round(raw.distanceMeters)
        : 0;
    const accuracy =
      typeof raw.accuracy === "number" && Number.isFinite(raw.accuracy)
        ? raw.accuracy
        : null;

    const validation = validateClaim({ distanceMeters, accuracy });
    if (validation.ok === false) {
      results.push({
        h3,
        rejected: { reason: validation.reason, detail: validation.detail },
      });
      continue;
    }

    const existing = existingByH3.get(h3);
    const alreadyOwnedThisRun =
      existing &&
      existing.ownerAddress === run.userAddress &&
      existing.runId === id;

    if (alreadyOwnedThisRun) {
      distanceDelta += distanceMeters;
      results.push({ h3, alreadyOwned: true });
      continue;
    }

    const country = countryForHex(h3);
    await db
      .insert(hexes)
      .values({
        h3Id: h3,
        ownerAddress: run.userAddress,
        runId: id,
        country,
      })
      .onConflictDoUpdate({
        target: hexes.h3Id,
        set: {
          ownerAddress: run.userAddress,
          runId: id,
          claimedAt: sql`now()`,
          country,
          // Re-capture: clear prior mint state so the finish flow re-mints
          // the hex to the new owner.
          mintedAt: null,
          mintTxHash: null,
        },
      });

    // Update the in-memory cache so a duplicate h3 later in the same batch
    // is treated as owned-this-run instead of a second conquest.
    existingByH3.set(h3, {
      h3Id: h3,
      ownerAddress: run.userAddress,
      runId: id,
    });

    newlyCaptured += 1;
    distanceDelta += distanceMeters;
    if (existing && existing.ownerAddress !== run.userAddress) {
      conquestDelta += 1;
    }
    results.push({ h3, alreadyOwned: false });
  }

  if (conquestDelta > 0) {
    await db
      .update(users)
      .set({ conquests: sql`${users.conquests} + ${conquestDelta}` })
      .where(eq(users.address, run.userAddress));
  }

  if (newlyCaptured > 0 || distanceDelta > 0) {
    await db
      .update(runs)
      .set({
        ...(newlyCaptured > 0
          ? { hexesClaimed: sql`${runs.hexesClaimed} + ${newlyCaptured}` }
          : {}),
        ...(distanceDelta > 0
          ? { distanceMeters: sql`${runs.distanceMeters} + ${distanceDelta}` }
          : {}),
      })
      .where(eq(runs.id, id));
  }

  log.info("hex batch processed", {
    runId: id,
    submitted: items.length,
    newlyCaptured,
    distanceDelta,
    conquestDelta,
  });

  // Legacy single-hex response shape preserved so old clients don't break
  // during the rollout window.
  if (!Array.isArray(body.hexes)) {
    const only = results[0];
    return NextResponse.json({
      ok: true,
      alreadyOwned: only?.alreadyOwned === true,
    });
  }

  return NextResponse.json({ ok: true, results });
}
