import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every transaction MiniKlaim sends, from the browser (MiniPay) or from the
 * relayer, must carry the Celo ERC-8021 attribution tag. This walks the
 * source and fails when a file submits a transaction without going through
 * withAttribution() (raw calldata) or ATTRIBUTION_SUFFIX (viem dataSuffix).
 * A new write path that forgets the tag fails CI instead of shipping.
 */

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "lib", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".claude", "contracts"]);
const WRITE_CALL = /\b(sendTransaction|writeContract|sendRawTransaction)\s*\(/;
const TAGGED = /\b(withAttribution|ATTRIBUTION_SUFFIX)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("attribution coverage", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
  const writers = files.filter((f) => WRITE_CALL.test(readFileSync(f, "utf8")));

  it("finds the known transaction call sites", () => {
    // Guards the scan itself: if this drops to zero the regex broke, not the app.
    expect(writers.length).toBeGreaterThanOrEqual(8);
  });

  it("tags every file that submits a transaction", () => {
    const untagged = writers
      .filter((f) => f !== join(ROOT, "lib/onchain/attribution.ts"))
      .filter((f) => !TAGGED.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(untagged).toEqual([]);
  });

  it("tags each sendTransaction call, not just the file", () => {
    // A file can tag one call and forget another: the count of raw
    // `data:` fields passed to sendTransaction must match the tagged ones.
    const offenders: string[] = [];
    for (const f of writers) {
      const src = readFileSync(f, "utf8");
      const sends = (src.match(/\bsendTransaction\s*\(/g) ?? []).length;
      const taggedData = (src.match(/data:\s*withAttribution\(/g) ?? []).length;
      if (sends > 0 && taggedData < sends) offenders.push(`${relative(ROOT, f)} (${taggedData}/${sends})`);
    }
    expect(offenders).toEqual([]);
  });
});
