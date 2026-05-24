import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:webhook");

export const dynamic = "force-dynamic";

// Stub for Farcaster Mini App lifecycle events (frame_added, notifications_enabled, etc.).
// Returns 200 so Farcaster considers the endpoint healthy. Will grow into a real
// notification dispatcher once we wire user-targeted pushes.
export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // ignore non-json bodies
  }
  log.info("webhook event", { body });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
