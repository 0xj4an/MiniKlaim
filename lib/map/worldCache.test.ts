import { describe, expect, test } from "vitest";
import { groupByOwner } from "./worldHexes";
import {
  cacheRequestHeaders,
  parseWorldBody,
  storedWorld,
} from "./worldCache";

const rows = [
  { h3: "a", owner: "0x1", ownerUsername: "ana" },
  { h3: "b", owner: "0x2", ownerUsername: null },
];
const body = JSON.stringify({ owners: groupByOwner(rows) });
const cached = { etag: '"abc"', body, savedAt: 1 };

describe("world cache", () => {
  test("sends the saved etag so a repeat open can be a 304", () => {
    expect(cacheRequestHeaders(null)).toEqual({});
    expect(cacheRequestHeaders('"abc"')).toEqual({ "If-None-Match": '"abc"' });
  });

  test("a 200 replaces the copy and a failure keeps it", () => {
    expect(storedWorld(cached, 200, '"def"', '{"owners":[]}', 50)).toEqual({
      etag: '"def"',
      body: '{"owners":[]}',
      savedAt: 50,
    });
    expect(storedWorld(cached, 304, null, "", 50)).toEqual({
      ...cached,
      savedAt: 50,
    });
    expect(storedWorld(cached, 504, null, "", 50)).toBe(cached);
    expect(storedWorld(null, 504, null, "", 50)).toBeNull();
  });

  test("reads the grouped body the map already understands", () => {
    expect(parseWorldBody(body)?.map((row) => row.h3).sort()).toEqual(["a", "b"]);
    expect(parseWorldBody("not json")).toBeNull();
    expect(parseWorldBody("")).toBeNull();
  });
});
