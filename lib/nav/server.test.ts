import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { upstreamRefusal } from "./server";

async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as { error?: string } };
}

describe("upstreamRefusal", () => {
  it("reads a request the provider cannot answer as no route", async () => {
    for (const status of [400, 404, 422]) {
      const got = await read(upstreamRefusal(status));
      expect(got.status).toBe(422);
      expect(JSON.stringify(got.body)).toContain("nav_no_route");
    }
  });

  it("keeps the provider's own failures as a failure on the way", async () => {
    for (const status of [401, 403, 429, 500, 503]) {
      const got = await read(upstreamRefusal(status));
      expect(got.status).toBe(502);
      expect(JSON.stringify(got.body)).toContain("nav_upstream_failed");
    }
  });
});
