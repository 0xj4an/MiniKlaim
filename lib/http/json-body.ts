import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gzip, gzipSync } from "node:zlib";
import { NextResponse } from "next/server";

export type PackedJson = {
  etag: string;
  json: Uint8Array;
  gzip: Uint8Array;
};

export function packJson(body: unknown): PackedJson {
  const json = Buffer.from(JSON.stringify(body));
  return {
    etag: createHash("sha1").update(json).digest("hex").slice(0, 20),
    json,
    gzip: gzipSync(json),
  };
}

const gzipOffThread = promisify(gzip);

/**
 * The same as `packJson` for a body that is already text and is large.
 *
 * `gzipSync` on the 9 MB world list held the process for 446 ms, measured
 * on prod on 16 Nov 2026. `gzip` does the same work on a libuv thread, and
 * the longest the process was held while it ran was 17 ms. Small bodies
 * keep `packJson`: for a few kilobytes the thread hop costs more than it
 * saves.
 */
export async function packJsonText(text: string): Promise<PackedJson> {
  const json = Buffer.from(text);
  return {
    etag: createHash("sha1").update(json).digest("hex").slice(0, 20),
    json,
    gzip: await gzipOffThread(json),
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
  const gzip = (request.headers.get("accept-encoding") ?? "").includes("gzip");
  if (gzip) {
    headers.set("Content-Encoding", "gzip");
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new NextResponse(copyBytes(packed.gzip), { status: 200, headers });
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new NextResponse(copyBytes(packed.json), { status: 200, headers });
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
