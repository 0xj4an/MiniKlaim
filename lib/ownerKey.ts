import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { runs, users } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { runTokenMatches } from "@/lib/onchain/sponsorRules";
import {
  hashOwnerKey,
  newOwnerKey,
  OWNER_KEY_BOOTSTRAP_BEFORE,
  OWNER_KEY_HEADER,
  ownerKeyDecision,
  ownerKeyMatches,
} from "@/lib/ownerKeyRules";

const log = createLogger("ownerKey");

/** Run tokens a phone can show, at most this many per request. */
const MAX_PROOFS = 50;

export type RunProof = { runId: string; token: string };

/** Whether the request carries this wallet's owner key. */
export async function requestHasOwnerKey(
  request: Request,
  address: string,
): Promise<boolean> {
  const presented = request.headers.get(OWNER_KEY_HEADER);
  if (!presented) return false;
  const [row] = await db
    .select({ ownerKeyHash: users.ownerKeyHash })
    .from(users)
    .where(eq(users.address, address.toLowerCase()))
    .limit(1);
  return ownerKeyMatches(row?.ownerKeyHash, presented);
}

/**
 * Hand this wallet's owner key to the caller when ownerKeyDecision allows
 * it. Returns the key, or null when the caller could not show it owns the
 * wallet.
 */
export async function issueOwnerKey(
  address: string,
  proofs: RunProof[],
): Promise<string | null> {
  const lower = address.toLowerCase();
  const [user] = await db
    .select({ ownerKeyHash: users.ownerKeyHash, username: users.username })
    .from(users)
    .where(eq(users.address, lower))
    .limit(1);
  const [anyRun] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.userAddress, lower))
    .limit(1);

  const ids = proofs
    .slice(0, MAX_PROOFS)
    .map((p) => p.runId)
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const oldRuns =
    ids.length > 0
      ? await db
          .select({ id: runs.id, claimTokenHash: runs.claimTokenHash })
          .from(runs)
          .where(
            and(
              inArray(runs.id, ids),
              eq(runs.userAddress, lower),
              lt(runs.startedAt, OWNER_KEY_BOOTSTRAP_BEFORE),
            ),
          )
      : [];
  const provenByOldRun = oldRuns.some((run) =>
    proofs.some(
      (p) => p.runId === run.id && runTokenMatches(run.claimTokenHash, p.token),
    ),
  );

  const decision = ownerKeyDecision({
    hasKey: !!user?.ownerKeyHash,
    hasUsername: !!user?.username,
    hasRuns: !!anyRun,
    provenByOldRun,
  });
  if (decision === "refused") {
    // At warn so it reaches the production log: this is the only place
    // that says who is being turned away. A wallet with a name or runs and
    // no token from before the bootstrap moment has no other door, and
    // most of them are owners coming back (14 Nov 2026: 33 wallets in 12
    // hours, 26 of them with nothing but a name or runs from October).
    log.warn("owner key refused", {
      address: lower,
      hasKey: !!user?.ownerKeyHash,
      hasUsername: !!user?.username,
      hasRuns: !!anyRun,
      proofs: proofs.length,
      oldRunsShown: oldRuns.length,
    });
    return null;
  }

  const key = newOwnerKey();
  const set = { ownerKeyHash: hashOwnerKey(key), ownerKeyAt: new Date() };
  if (decision === "proven") {
    await db
      .insert(users)
      .values({ address: lower, ...set })
      .onConflictDoUpdate({ target: users.address, set });
  } else {
    // Fresh: only while still keyless, so two phones racing for a new
    // wallet cannot both walk away with a key.
    await db.insert(users).values({ address: lower }).onConflictDoNothing();
    const won = await db
      .update(users)
      .set(set)
      .where(and(eq(users.address, lower), isNull(users.ownerKeyHash)))
      .returning({ address: users.address });
    if (won.length === 0) return null;
  }
  log.info("owner key issued", { address: lower, via: decision });
  return key;
}

/** Parse the `runs` proof list a client sends, dropping anything malformed. */
export function parseRunProofs(body: unknown): RunProof[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as { runs?: unknown }).runs;
  if (!Array.isArray(raw)) return [];
  const out: RunProof[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { runId, token } = item as { runId?: unknown; token?: unknown };
    if (typeof runId === "string" && typeof token === "string" && token.length <= 100) {
      out.push({ runId, token });
    }
  }
  return out;
}
