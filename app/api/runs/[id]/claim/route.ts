import { eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";
import { cityForHex } from "@/lib/geo/city";
import { countryForHex } from "@/lib/geo/country";
import { createLogger } from "@/lib/logger";
import { hexClaimAction } from "@/lib/runs/claimDecision";
import { addressesForPlayer } from "@/lib/players";
import { validateClaim } from "@/lib/runs/validation";
import { checkChain, pathFitsReported } from "@/lib/runs/movementGuard";

const log = createLogger("api:runs:claim");

export const dynamic = "force-dynamic";

/**
 * Claim one or more hexes for a run. Accepts two body shapes:
 *   - Legacy: { h3, distanceMeters?, accuracy? }, one hex per request.
 *   - Batch:  { hexes: [{ h3, distanceMeters?, accuracy? }, ...] }, one round
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
      startedAt: runs.startedAt,
      distanceMeters: runs.distanceMeters,
      lastH3: runs.lastH3,
      lastClaimAt: runs.lastClaimAt,
      serverDistanceMeters: runs.serverDistanceMeters,
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
  const playerAddresses = new Set(
    (await addressesForPlayer(run.userAddress)).map((address) => address.toLowerCase()),
  );

  // Movement guard: the batch must be a path the phone could travel since
  // the run's last capture, and the hex path must roughly match the distance
  // the client reports. See lib/runs/movementGuard.ts.
  const now = new Date();
  const ordered = items
    .filter((raw) => typeof raw.h3 === "string" && raw.h3.length > 0)
    .map((raw) => raw.h3);
  const chain = checkChain({
    lastH3: run.lastH3,
    lastAt: run.lastClaimAt ?? run.startedAt,
    now,
    hexes: ordered,
  });
  const reportedInBatch = items.reduce(
    (sum, raw) =>
      sum +
      (typeof raw.distanceMeters === "number" && Number.isFinite(raw.distanceMeters) && raw.distanceMeters > 0
        ? Math.min(raw.distanceMeters, 10_000)
        : 0),
    0,
  );
  const pathOk = pathFitsReported(
    run.serverDistanceMeters + chain.meters,
    run.distanceMeters + reportedInBatch,
  );
  const blocked = new Set(pathOk ? chain.rejected : ordered);
  const blockedReason = pathOk ? "too-fast" : "path-mismatch";
  let rejectedByGuard = 0;

  const results: Array<{
    h3: string;
    alreadyOwned?: boolean;
    rejected?: { reason: string; detail?: string };
  }> = [];
  let newlyCaptured = 0;
  let distanceDelta = 0;
  let conquestDelta = 0;
  // Written in one statement after the loop. One INSERT per hex was the
  // N+1 Sentry flagged (MINIKLAIM-V). The in-memory map below keeps a
  // repeated h3 out of this list, which ON CONFLICT requires.
  const toWrite: Array<typeof hexes.$inferInsert> = [];

  for (const raw of items) {
    const h3 = raw.h3;
    if (!h3 || typeof h3 !== "string") {
      results.push({ h3: "", rejected: { reason: "invalid-h3" } });
      continue;
    }

    if (blocked.has(h3)) {
      rejectedByGuard += 1;
      results.push({ h3, rejected: { reason: blockedReason } });
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
    const action = hexClaimAction(existing, playerAddresses);

    // Already this player's hex, on this run or an older one, on this
    // wallet or a linked one. Keep the row. Do not clear the mint and do
    // not count it again. Distance still counts.
    if (action === "own") {
      distanceDelta += distanceMeters;
      results.push({ h3, alreadyOwned: true });
      continue;
    }

    const country = countryForHex(h3);
    const city = country ? cityForHex(h3, country) : null;
    toWrite.push({
      h3Id: h3,
      ownerAddress: run.userAddress,
      runId: id,
      country,
      city,
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
    if (action === "take") conquestDelta += 1;
    results.push({ h3, alreadyOwned: false });
  }

  if (toWrite.length > 0) {
    await db
      .insert(hexes)
      .values(toWrite)
      .onConflictDoUpdate({
        target: hexes.h3Id,
        set: {
          ownerAddress: sql`excluded.owner_address`,
          runId: sql`excluded.run_id`,
          claimedAt: sql`now()`,
          country: sql`excluded.country`,
          city: sql`excluded.city`,
          // Re-capture: clear prior mint state so the finish flow re-mints
          // the hex to the new owner.
          mintedAt: null,
          mintTxHash: null,
        },
      });
  }

  if (conquestDelta > 0) {
    await db
      .update(users)
      .set({ conquests: sql`${users.conquests} + ${conquestDelta}` })
      .where(eq(users.address, run.userAddress));
  }

  if (rejectedByGuard > 0) {
    log.warn("movement guard rejected hexes", {
      runId: id,
      player: run.userAddress,
      reason: blockedReason,
      rejected: rejectedByGuard,
      submitted: items.length,
      serverMeters: Math.round(run.serverDistanceMeters + chain.meters),
      reportedMeters: Math.round(run.distanceMeters + reportedInBatch),
    });
  }
  const guardAccepted = pathOk && chain.accepted.length > 0;
  await db
    .update(runs)
    .set({
      ...(guardAccepted
        ? {
            lastH3: chain.endH3,
            lastClaimAt: now,
            serverDistanceMeters: sql`${runs.serverDistanceMeters} + ${Math.round(chain.meters)}`,
          }
        : {}),
      rejectedHexes: sql`${runs.rejectedHexes} + ${rejectedByGuard}`,
    })
    .where(eq(runs.id, id));

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
