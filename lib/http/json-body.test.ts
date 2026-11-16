import { describe, expect, test } from "vitest";
import { gunzipSync } from "node:zlib";
import { jsonBody, packJson, packJsonText } from "./json-body";

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

describe("packJsonText", () => {
  const body = { owners: [{ owner: "0x" + "ab".repeat(20), ownerUsername: "\u00e9", h3: ["a", "b"] }] };

  // A phone holding a copy made by the old packer must still get its 304.
  test("gives the same tag and the same bytes as packJson", async () => {
    const sync = packJson(body);
    const text = await packJsonText(JSON.stringify(body));
    expect(text.etag).toBe(sync.etag);
    expect(Buffer.from(text.json).equals(Buffer.from(sync.json))).toBe(true);
  });

  test("compresses to something that opens back into the same text", async () => {
    const text = await packJsonText(JSON.stringify(body));
    expect(gunzipSync(text.gzip).toString()).toBe(JSON.stringify(body));
  });
});
