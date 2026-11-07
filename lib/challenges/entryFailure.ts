import { mintFailureKind, type MintFailureKind } from "@/lib/wallet/mintFailure";

/**
 * What the wallet said when an entry failed, in full. The PostHog `message`
 * used to be cut at 200 characters, which kept viem's "Request Arguments"
 * header and dropped the wallet's own detail: on 7 Nov 2026 a MiniPay
 * `Permission denied` on the entry transfer could not be told apart from a
 * closed sheet for that reason.
 */
export type EntryErrorDetail = {
  kind: MintFailureKind;
  name: string | null;
  code: string | null;
  short: string | null;
  details: string | null;
  causes: string[];
};

function field(e: unknown, key: string): unknown {
  return e && typeof e === "object" && key in e ? (e as Record<string, unknown>)[key] : undefined;
}

function str(v: unknown, max: number): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v).slice(0, max);
}

/** Walk the viem error chain and keep every level's name, code and message. */
export function describeEntryError(e: unknown): EntryErrorDetail {
  const causes: string[] = [];
  let code: string | null = null;
  let cur: unknown = e;
  for (let depth = 0; cur && depth < 6; depth++) {
    const c = field(cur, "code");
    if (code === null && c !== undefined) code = String(c);
    const label = [str(field(cur, "name"), 60), c !== undefined ? `code=${String(c)}` : null, str(field(cur, "shortMessage") ?? field(cur, "message"), 300)]
      .filter(Boolean)
      .join(" | ");
    if (label) causes.push(label);
    cur = field(cur, "cause");
  }
  return {
    kind: mintFailureKind(e),
    name: str(field(e, "name"), 60),
    code,
    short: str(field(e, "shortMessage"), 300),
    details: str(field(e, "details"), 1000),
    causes,
  };
}

/** One Sentry issue per kind: the wallet's text carries addresses and amounts. */
export function entryFailureFingerprint(kind: string): string[] {
  return ["challenge-enter-failed", kind];
}
