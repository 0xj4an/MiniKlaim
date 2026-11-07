import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { type Address, getAddress } from "viem";
import { db } from "@/lib/db";
import { challenges } from "@/lib/db/schema";
import { enteredOnchain, isRegisteredOnchain, readEntryFunds, sendEnterFor } from "@/lib/challenges/allowance";
import { checkEntryTx, challengeDepositAddress, hasEntered, recordEntry } from "@/lib/challenges/server";
import { dropsPublicClient } from "@/lib/drops/claim";
import { dropsAddress } from "@/lib/drops/config";
import { createLogger } from "@/lib/logger";
import { isSignerConfigured } from "@/lib/onchain/signer";

const log = createLogger("api:challenges:enter");

export const dynamic = "force-dynamic";

/** One entry in flight per player and challenge, so a double tap sends one tx. */
const inFlight = new Set<string>();

function fail(reason: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, reason, ...extra }, { status });
}

/**
 * Tap to enter: the relayer charges the entry fee from the player's allowance
 * with `enterFor` and pays the gas. The player approved the drops contract
 * once; nothing here asks the wallet for anything.
 *
 * 409 `needs-approval` / `no-funds` tell the card what to show; 409
 * `entered` means it is already done.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { address?: string };
  const raw = (body.address ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(raw)) return fail("invalid-address", 400);
  const player = getAddress(raw) as Address;
  const contract = dropsAddress();
  if (!contract || !isSignerConfigured()) return fail("not-configured", 503);

  const [c] = await db.select().from(challenges).where(eq(challenges.id, id)).limit(1);
  if (!c) return fail("unknown-challenge", 404);
  const now = new Date();
  if (c.status !== "open" || now < c.opensAt || now > c.entryClosesAt) return fail("entries-closed", 409);

  const key = `${c.id}:${raw}`;
  if (inFlight.has(key)) return fail("in-flight", 409);
  inFlight.add(key);
  const tags = { flow: "challenge-enter", step: "relay", challenge: c.id };
  try {
    if (await hasEntered(db, c.id, [raw])) return fail("entered", 409);
    if (!(await isRegisteredOnchain(contract, c))) {
      Sentry.captureMessage("Challenge not registered onchain", {
        level: "error",
        tags,
        fingerprint: ["challenge-not-registered", c.id],
      });
      return fail("not-registered", 503);
    }
    if (await enteredOnchain(contract, c, player)) return fail("entered", 409);
    const fee = BigInt(c.entryAmount);
    const { allowance, balance } = await readEntryFunds(c.token as Address, player, contract);
    if (balance < fee) return fail("no-funds", 409, { balance: balance.toString() });
    if (allowance < fee) return fail("needs-approval", 409, { allowance: allowance.toString() });

    const txHash = await sendEnterFor(c, player);
    const receipt = await dropsPublicClient().waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
    if (receipt.status !== "success") {
      Sentry.captureMessage("Challenge enterFor reverted", {
        level: "error",
        tags,
        fingerprint: ["challenge-enterfor-reverted"],
        extra: { txHash, player: raw },
      });
      return fail("reverted", 502, { txHash });
    }
    const deposit = challengeDepositAddress() ?? contract;
    const check = await checkEntryTx(c, txHash, deposit);
    if ("reason" in check) {
      Sentry.captureMessage(`Challenge enterFor not readable: ${check.reason}`, {
        level: "error",
        tags,
        fingerprint: ["challenge-enterfor-unreadable", check.reason],
        extra: { txHash, player: raw },
      });
      return fail(check.reason, 502, { txHash });
    }
    const outcome = await recordEntry(db, c, txHash, check);
    log.warn("challenge entry by allowance", { id: c.id, player: raw, txHash, outcome });
    return NextResponse.json({ ok: true, outcome, txHash });
  } catch (e) {
    Sentry.captureException(e, { tags, fingerprint: ["challenge-enter-relay-error"], extra: { player: raw } });
    log.error("enter failed", { id, player: raw, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    return fail("error", 502);
  } finally {
    inFlight.delete(key);
  }
}
