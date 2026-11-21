/**
 * What the RPC said when a relayer transaction was refused, kept whole.
 *
 * The log line used to be the first 300 characters of viem's message, which
 * is its "Missing or invalid parameters" header, the URL and the start of
 * the request body: on 20 Nov 2026 forno refused a sponsored captureBatch
 * and the node's own reason (`details`, the JSON-RPC code and `data`) was
 * past the cut, so the refusal could not be explained.
 *
 * Nothing secret is in here: the node's reply, never the signed transaction.
 */
export type RpcFailure = {
  name: string | null;
  code: string | null;
  short: string | null;
  details: string | null;
  data: string | null;
  causes: string[];
};

function field(e: unknown, key: string): unknown {
  return e && typeof e === "object" && key in e
    ? (e as Record<string, unknown>)[key]
    : undefined;
}

function str(v: unknown, max: number): string | null {
  if (v === undefined || v === null || v === "") return null;
  const text = typeof v === "string" ? v : safeJson(v);
  return text.slice(0, max);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Walk the viem error chain: every level's name, code and short message. */
export function describeRpcFailure(e: unknown): RpcFailure {
  const causes: string[] = [];
  let code: string | null = null;
  let details: string | null = null;
  let data: string | null = null;
  let cur: unknown = e;
  for (let depth = 0; cur && depth < 6; depth++) {
    const c = field(cur, "code");
    if (code === null && c !== undefined) code = String(c);
    if (details === null) details = str(field(cur, "details"), 1_000);
    if (data === null) data = str(field(cur, "data"), 500);
    const label = [
      str(field(cur, "name"), 60),
      c !== undefined ? `code=${String(c)}` : null,
      str(field(cur, "shortMessage") ?? field(cur, "message"), 300),
    ]
      .filter(Boolean)
      .join(" | ");
    if (label) causes.push(label);
    cur = field(cur, "cause");
  }
  return {
    name: str(field(e, "name"), 60),
    code,
    short: str(field(e, "shortMessage"), 300),
    details,
    data,
    causes,
  };
}
