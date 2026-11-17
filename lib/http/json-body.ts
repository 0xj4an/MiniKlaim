import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * A JSON body built once and served many times, with the tag that lets a
 * phone holding the same copy get a 304 instead of the body.
 *
 * There is no compressed copy in here, on purpose. This used to keep one
 * and send it with `Content-Encoding: gzip`, so a 9 MB list was compressed
 * once and not on every request. Next 16.4 drops `Content-Encoding` from
 * what a route returns (`FORBIDDEN_HEADERS` in next/dist/server/
 * send-response.js) and then compresses the response itself. The bytes that
 * went out were gzip inside gzip under one header: the browser opened one
 * layer, found binary where it expected JSON, and every map that reads
 * /api/hexes went blank. 17 Nov 2026, live for hours, and no test caught it
 * because the header is dropped after the route returns.
 *
 * So the body goes out plain and Next compresses it, on a stream, off the
 * main thread. A route cannot send its own compressed bytes on this
 * framework, and `jsonBody` must never set `Content-Encoding` again.
 */
export type PackedJson = {
  etag: string;
  json: Uint8Array;
};

export function packJson(body: unknown): PackedJson {
  return packJsonText(JSON.stringify(body));
}

/** The same for a body that is already text, as the world list builds it. */
export function packJsonText(text: string): PackedJson {
  const json = Buffer.from(text);
  return {
    etag: createHash("sha1").update(json).digest("hex").slice(0, 20),
    json,
  };
}

function noneMatch(header: string | null, tag: string): boolean {
  if (!header) return false;
  return header.split(",").some((part) => {
    const value = part.trim();
    return value === tag || value === `W/${tag}`;
  });
}

export function jsonBody(
  request: Request,
  packed: PackedJson,
  cacheControl: string,
): NextResponse {
  const tag = `"${packed.etag}"`;
  const headers = new Headers({
    ETag: tag,
    "Cache-Control": cacheControl,
    Vary: "Accept-Encoding",
  });
  if (noneMatch(request.headers.get("if-none-match"), tag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new NextResponse(copyBytes(packed.json), { status: 200, headers });
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
