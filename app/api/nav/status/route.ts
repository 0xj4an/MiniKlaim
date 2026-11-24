import { NextResponse } from "next/server";
import { navCreditsLeft } from "@/lib/nav/budget";
import { navApiKey } from "@/lib/nav/server";

export const dynamic = "force-dynamic";

/**
 * Whether the run screen should offer "Where to?" at all. No key, or the
 * day's free budget already spent: the button is simply not there, rather
 * than there and failing.
 */
export async function GET() {
  return NextResponse.json(
    { enabled: navApiKey() !== null && navCreditsLeft() > 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
