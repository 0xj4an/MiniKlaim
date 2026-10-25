import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs, users } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { hashRunToken, newRunToken } from "@/lib/onchain/sponsorRules";
import { isMoveMode } from "@/lib/runs/moveMode";
import { isValidTimeZone } from "@/lib/runs/streakMath";

const log = createLogger("api:runs");

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    address?: string;
    mode?: string;
    timeZone?: string;
  };
  const address = body.address?.toLowerCase();

  if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  // The phone's time zone decides where a streak day ends. Older clients
  // send nothing; keep whatever was saved before.
  const timeZone = isValidTimeZone(body.timeZone) ? body.timeZone : null;
  if (timeZone) {
    await db
      .insert(users)
      .values({ address, timeZone })
      .onConflictDoUpdate({ target: users.address, set: { timeZone } });
  } else {
    await db
      .insert(users)
      .values({ address })
      .onConflictDoNothing({ target: users.address });
  }

  // Only this client gets the token. Sponsor and decline calls for the run
  // must present it, so nobody else can spend the relayer on it.
  const claimToken = newRunToken();
  const [run] = await db
    .insert(runs)
    .values({
      userAddress: address,
      claimTokenHash: hashRunToken(claimToken),
      // How the player said they travel. Older clients send nothing.
      declaredMode: isMoveMode(body.mode) ? body.mode : null,
    })
    .returning({ id: runs.id, startedAt: runs.startedAt });

  log.info("run started", { id: run.id, address });

  return NextResponse.json({ ...run, claimToken });
}
