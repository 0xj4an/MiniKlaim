import { existsSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { DRAIN_FLAG } from "@/lib/drain";
import { GET } from "./route";

describe("/api/ready", () => {
  const had = existsSync(DRAIN_FLAG);
  afterEach(() => {
    if (!had) rmSync(DRAIN_FLAG, { force: true });
  });

  it("is ready without the drain flag", async () => {
    if (had) return;
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ready: true });
  });

  it("asks for no new requests while the flag is there", async () => {
    writeFileSync(DRAIN_FLAG, "");
    const res = GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ready: false });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
