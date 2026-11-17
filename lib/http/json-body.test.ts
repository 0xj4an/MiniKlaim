import { describe, expect, test } from "vitest";
import { jsonBody, packJson, packJsonText } from "./json-body";

describe("jsonBody", () => {
  const packed = packJson({ hexes: [{ h3: "abc", owner: "0x" + "ab".repeat(20) }] });

  // 17 Nov 2026: this sent its own gzip with Content-Encoding. Next 16.4
  // drops that header from a route's response and compresses again, so the
  // phone got gzip inside gzip and every map reading /api/hexes went blank.
  // The body must leave here plain, whatever the client accepts.
  test("never compresses or sets Content-Encoding, even for a client that takes gzip", async () => {
    for (const accept of ["gzip, deflate, br, zstd", "gzip", "br", "*"]) {
      const res = jsonBody(
        new Request("https://miniklaim.fun/api/hexes", {
          headers: { "accept-encoding": accept },
        }),
        packed,
        "public, max-age=60",
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-encoding")).toBeNull();
      expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(res.headers.get("etag")).toBe(`"${packed.etag}"`);
      const raw = Buffer.from(await res.arrayBuffer());
      // Not a gzip stream: those start 1f 8b.
      expect(raw.subarray(0, 2).toString("hex")).not.toBe("1f8b");
      expect(JSON.parse(raw.toString())).toEqual({
        hexes: [{ h3: "abc", owner: "0x" + "ab".repeat(20) }],
      });
    }
  });

  test("sends the same plain json to a client that accepts nothing", async () => {
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

  test("still tells caches the answer depends on Accept-Encoding", () => {
    const res = jsonBody(new Request("https://miniklaim.fun/api/hexes"), packed, "private");
    expect(res.headers.get("vary")).toContain("Accept-Encoding");
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

describe("packJsonText", () => {
  const body = { owners: [{ owner: "0x" + "ab".repeat(20), ownerUsername: "\u00e9", h3: ["a", "b"] }] };

  // A phone holding a copy made by the other packer must still get its 304.
  test("gives the same tag and the same bytes as packJson", () => {
    const whole = packJson(body);
    const text = packJsonText(JSON.stringify(body));
    expect(text.etag).toBe(whole.etag);
    expect(Buffer.from(text.json).equals(Buffer.from(whole.json))).toBe(true);
  });

  test("keeps no compressed copy", () => {
    expect(Object.keys(packJsonText("{}")).sort()).toEqual(["etag", "json"]);
  });
});
