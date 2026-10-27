import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Next hands route params as a promise. A file that types them as a plain
 * object still compiles, and the value is silently undefined at runtime:
 * `app/p/[username]/opengraph-image.tsx` did that, so every shared profile
 * link fetched /api/profile/undefined and previewed as "Player not found"
 * (27 Oct). TypeScript cannot catch it, so this walks the dynamic routes and
 * fails when `params` is typed without a Promise.
 */

const APP = join(__dirname);
const SKIP = new Set(["node_modules", ".next"]);
const PARAMS_TYPE = /params\s*:\s*([^;\n]+)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("dynamic route params", () => {
  // Only files under a [param] segment receive route params.
  const files = walk(APP).filter((f) => f.includes("["));

  it("covers the dynamic routes", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it("types every params annotation as a Promise", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(PARAMS_TYPE)) {
        const type = m[1].trim();
        // Property shorthand in a destructuring pattern, not a type.
        if (!type.startsWith("{") && !type.startsWith("Promise")) continue;
        if (type.startsWith("Promise")) continue;
        offenders.push(`${relative(APP, file)}: params: ${type}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
