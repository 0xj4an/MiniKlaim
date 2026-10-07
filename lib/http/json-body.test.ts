import { gunzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { jsonBody, packJson } from "./json-body";

describe("jsonBody", () => {
  const packed = packJson({ hexes: [{ h3: "abc", owner: "0x" + "ab".repeat(20) }] });

  test("sends gzip when the client accepts it", async () => {
    const res = jsonBody(
      new Request("https://miniklaim.fun/api/hexes", {
        headers: { "accept-encoding": "gzip, deflate, br" },
      }),
      packed,
      "public, max-age=60",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("etag")).toBe(`"${packed.etag}"`);
    const raw = Buffer.from(await res.arrayBuffer());
    expect(JSON.parse(gunzipSync(raw).toString())).toEqual({
      hexes: [{ h3: "abc", owner: "0x" + "ab".repeat(20) }],
    });
    expect(raw.byteLength).toBeLessThan(packed.json.byteLength);
  });

  test("sends plain json when gzip is not accepted", async () => {
    const res = jsonBody(
      new Request("https://miniklaim.fun/api/hexes"),
      packed,
      "private, no-cache",
    );
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.json()).toEqual({
      hexes: [{ h3: "abc", owner: "0x" + "ab".repeat(20) }],
    });
  });

  test("answers 304 when the etag matches", () => {
    const res = jsonBody(
      new Request("https://miniklaim.fun/api/hexes", {
        headers: {
          "accept-encoding": "gzip",
          "if-none-match": `"${packed.etag}"`,
        },
      }),
      packed,
      "public, max-age=60",
    );
    expect(res.status).toBe(304);
    expect(res.headers.get("content-encoding")).toBeNull();
  });
});
