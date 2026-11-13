import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { linkCodes, playerWallets, players, runs, users } from "@/lib/db/schema";
import { hashRunToken } from "@/lib/onchain/sponsorRules";
import { OWNER_KEY_BOOTSTRAP_BEFORE, OWNER_KEY_HEADER } from "@/lib/ownerKeyRules";

// Owner keys, the name change and the link code that ask for them.
// TEST_DATABASE_URL=postgresql://... npx vitest run "app/api/users/[address]/owner-key/route.db.test.ts"
// CI has no database, so it is skipped there.
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { prepare: false, max: 2 }) : null;
const db = client ? drizzle(client) : null;

const NEW = "0x00000000000000000000000000000000000a0a01";
const OLD = "0x00000000000000000000000000000000000a0a02";
const ALL = [NEW, OLD];
const OLD_RUN = "a0a0a0a0-0000-0000-0000-000000000001";
const LATE_RUN = "a0a0a0a0-0000-0000-0000-000000000002";
const OLD_TOKEN = "old-run-token";
const LATE_TOKEN = "late-run-token";

type Handler = (
  request: Request,
  ctx: { params: Promise<{ address: string }> },
) => Promise<Response>;
let ownerKey: Handler;
let username: Handler;
let link: (request: Request) => Promise<Response>;

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const askKey = async (address: string, runList: unknown[] = []) => {
  const res = await ownerKey(
    new Request(`http://test/api/users/${address}/owner-key`, json({ runs: runList })),
    { params: Promise.resolve({ address }) },
  );
  return { status: res.status, key: ((await res.json()) as { key?: string }).key };
};

const rename = (address: string, name: string, key?: string) =>
  username(
    new Request(
      `http://test/api/users/${address}/username`,
      json({ username: name }, key ? { [OWNER_KEY_HEADER]: key } : {}),
    ),
    { params: Promise.resolve({ address }) },
  );

const cleanup = async () => {
  await db!.delete(runs).where(inArray(runs.userAddress, ALL));
  const wallets = await db!
    .select({ playerId: playerWallets.playerId })
    .from(playerWallets)
    .where(inArray(playerWallets.address, ALL));
  await db!.delete(playerWallets).where(inArray(playerWallets.address, ALL));
  if (wallets.length > 0) {
    const ids = wallets.map((w) => w.playerId);
    await db!.delete(linkCodes).where(inArray(linkCodes.playerId, ids));
    await db!.delete(players).where(inArray(players.id, wallets.map((w) => w.playerId)));
  }
  await db!.delete(users).where(inArray(users.address, ALL));
};

describe.skipIf(!db)("owner keys (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ POST: ownerKey } = await import("./route"));
    ({ POST: username } = await import("../username/route"));
    ({ POST: link } = await import("../../../link/route"));
  });

  beforeEach(async () => {
    await cleanup();
    // OLD played before owner keys existed, has a name, and played again since.
    await db!.insert(users).values({ address: OLD, username: "old_player" });
    await db!.insert(runs).values([
      {
        id: OLD_RUN,
        userAddress: OLD,
        claimTokenHash: hashRunToken(OLD_TOKEN),
        startedAt: new Date(OWNER_KEY_BOOTSTRAP_BEFORE.getTime() - 86_400_000),
      },
      {
        id: LATE_RUN,
        userAddress: OLD,
        claimTokenHash: hashRunToken(LATE_TOKEN),
        startedAt: new Date(OWNER_KEY_BOOTSTRAP_BEFORE.getTime() + 60_000),
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await client!.end();
  });

  it("gives a new wallet a key once, and only to the first phone", async () => {
    const first = await askKey(NEW);
    expect(first.status).toBe(200);
    expect(first.key).toBeTruthy();
    expect((await askKey(NEW)).status).toBe(403);
    expect((await rename(NEW, "fresh_one", first.key)).status).toBe(200);
  });

  it("refuses a played wallet's key to a caller without an old run token", async () => {
    expect((await askKey(OLD)).status).toBe(403);
    // A token from a run started after the cutoff: anyone can start one.
    expect((await askKey(OLD, [{ runId: LATE_RUN, token: LATE_TOKEN }])).status).toBe(403);
    // The right run with the wrong token.
    expect((await askKey(OLD, [{ runId: OLD_RUN, token: "guess" }])).status).toBe(403);
  });

  it("gives a played wallet its key for a run token from before the cutoff", async () => {
    const got = await askKey(OLD, [{ runId: OLD_RUN, token: OLD_TOKEN }]);
    expect(got.status).toBe(200);
    expect((await rename(OLD, "old_renamed", got.key)).status).toBe(200);
  });

  it("refuses a rename without the key, and the name stays", async () => {
    expect((await rename(OLD, "stolen_name")).status).toBe(403);
    expect((await rename(OLD, "stolen_name", "not-the-key")).status).toBe(403);
    const [row] = await db!.select().from(users).where(eq(users.address, OLD));
    expect(row.username).toBe("old_player");
  });

  it("makes a link code only for the phone holding the wallet's key", async () => {
    const make = (key?: string) =>
      link(
        new Request(
          "http://test/api/link",
          json({ address: OLD }, key ? { [OWNER_KEY_HEADER]: key } : {}),
        ),
      );
    expect((await make()).status).toBe(403);
    const got = await askKey(OLD, [{ runId: OLD_RUN, token: OLD_TOKEN }]);
    const res = await make(got.key);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { code?: string }).code).toMatch(/^[0-9A-F]{8}$/);
  });
});
