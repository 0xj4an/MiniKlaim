import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
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
    return new NextResponse(packed.gzip, { status: 200, headers });
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new NextResponse(packed.json, { status: 200, headers });
}
