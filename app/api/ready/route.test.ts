import { existsSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAIN_FLAG } from "@/lib/drain";

const warm = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/map/worldList", () => ({ worldListWarm: () => warm.value }));

import { GET } from "./route";

describe("/api/ready", () => {
  const had = existsSync(DRAIN_FLAG);
  afterEach(() => {
    if (!had) rmSync(DRAIN_FLAG, { force: true });
    warm.value = true;
  });

  it("is ready once the world list is warm and nothing is draining", async () => {
    if (had) return;
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ready: true });
  });

  it("asks for no new requests while the drain flag is there", async () => {
    writeFileSync(DRAIN_FLAG, "");
    const res = GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ready: false, reason: "draining" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps a fresh container out while the world list builds", async () => {
    if (had) return;
    warm.value = false;
    // The test process has been up for less than the ceiling.
    if (process.uptime() >= 90) return;
    const res = GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ready: false, reason: "warming" });
  });
});
