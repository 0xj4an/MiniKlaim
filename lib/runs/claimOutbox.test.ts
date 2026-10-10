import { describe, expect, test } from "vitest";
import { latLngToCell } from "h3-js";
import {
  CLAIM_BATCH_MAX,
  CLAIM_FLUSH_MS,
  GPS_GAP_STALE_SECONDS,
  addHexes,
  applyHttp,
  flushDelay,
  hexesForSegment,
  parseQueue,
  takeBatch,
  type ClaimOutcome,
  type QueuedHex,
} from "./claimOutbox";

const RES = 12;
const MDE_LAT = 6.2529;
const MDE_LNG = -75.5646;

function hex(h3: string, distanceMeters = 10): QueuedHex {
  return { h3, distanceMeters };
}

describe("hexesForSegment", () => {
  test("a signal gap stores only the hex under the new fix", () => {
    const from = { lat: MDE_LAT, lng: MDE_LNG };
    const to = { lat: MDE_LAT + 0.02, lng: MDE_LNG };
    const gap = GPS_GAP_STALE_SECONDS + 35;
    const out = hexesForSegment(from, to, gap, RES);
    const end = latLngToCell(to.lat, to.lng, RES);
    const mid = latLngToCell(MDE_LAT + 0.01, MDE_LNG, RES);
    expect(out).toEqual([end]);
    expect(out).not.toContain(mid);
  });

  test("two fresh fixes keep the cells the player crossed", () => {
    const from = { lat: MDE_LAT, lng: MDE_LNG };
    const to = { lat: MDE_LAT + 0.0018, lng: MDE_LNG };
    const out = hexesForSegment(from, to, 2, RES);
    expect(out.length).toBeGreaterThan(5);
    expect(out[out.length - 1]).toBe(latLngToCell(to.lat, to.lng, RES));
    expect(out).not.toContain(latLngToCell(from.lat, from.lng, RES));
  });

  test("the first fix of a run stores the current hex", () => {
    const to = { lat: MDE_LAT, lng: MDE_LNG };
    expect(hexesForSegment(null, to, 0, RES)).toEqual([
      latLngToCell(to.lat, to.lng, RES),
    ]);
  });
});

describe("outbox", () => {
  test("ignores duplicate hexes and a broken saved queue", () => {
    const items = addHexes(
      [hex("a")],
      [hex("a", 99), hex("b"), hex("")],
    );
    expect(items.map((item) => item.h3)).toEqual(["a", "b"]);
    expect(items[0].distanceMeters).toBe(10);
    expect(parseQueue("not-json")).toEqual([]);
    expect(parseQueue(JSON.stringify([{ h3: "c", distanceMeters: 4 }]))).toEqual([
      { h3: "c", distanceMeters: 4 },
    ]);
  });

  test("a rejected hex is not uploaded again", () => {
    const sent = ["a", "b"];
    const applied = applyHttp(
      [hex("a"), hex("b"), hex("c")],
      sent,
      {
        kind: "ok",
        results: [
          { h3: "a", rejected: { reason: "accuracy-too-poor" } },
          { h3: "b", alreadyOwned: true },
        ],
      },
      2,
    );
    expect(applied.items.map((item) => item.h3)).toEqual(["c"]);
    expect(applied.newly).toBe(0);
    expect(applied.failures).toBe(0);
    expect(applied.retryMs).toBe(CLAIM_FLUSH_MS);
  });

  test("an ended run drops the queue", () => {
    const applied = applyHttp([hex("a")], ["a"], { kind: "ended" }, 1);
    expect(applied.items).toEqual([]);
    expect(applied.retryMs).toBeNull();
  });
});

type Server = (now: number, sent: string[]) => ClaimOutcome;

function simulate(opts: {
  arrivals: Array<{ t: number; ids: string[] }>;
  until: number;
  server: Server;
}) {
  let items: QueuedHex[] = [];
  let lastFlushAt = -CLAIM_FLUSH_MS;
  let failures = 0;
  let nextFlushAt = 0;
  let posts = 0;
  let rateLimits = 0;
  const postTimes: number[] = [];

  const flush = (now: number) => {
    if (items.length === 0) return;
    const { batch } = takeBatch(items);
    posts += 1;
    postTimes.push(now);
    const outcome = opts.server(
      now,
      batch.map((item) => item.h3),
    );
    if (outcome.kind === "rate") rateLimits += 1;
    const applied = applyHttp(
      items,
      batch.map((item) => item.h3),
      outcome,
      failures,
    );
    items = applied.items;
    failures = applied.failures;
    lastFlushAt = now;
    nextFlushAt =
      applied.retryMs === null ? Number.POSITIVE_INFINITY : now + applied.retryMs;
  };

  const events = opts.arrivals
    .map((arrival) => ({ t: arrival.t, ids: arrival.ids }))
    .sort((a, b) => a.t - b.t);

  let cursor = 0;
  for (let now = 0; now <= opts.until; now += 100) {
    while (cursor < events.length && events[cursor].t <= now) {
      const incoming = events[cursor].ids.map((id) => hex(id));
      const before = items.length;
      items = addHexes(items, incoming);
      if (items.length > before && nextFlushAt === Number.POSITIVE_INFINITY) {
        nextFlushAt = now + flushDelay(lastFlushAt, now);
      }
      if (before === 0 && items.length > 0) {
        nextFlushAt = now + flushDelay(lastFlushAt, now);
      }
      cursor += 1;
    }
    if (now >= nextFlushAt && items.length > 0) flush(now);
  }

  if (items.length > 0) {
    let now = Number.isFinite(nextFlushAt) ? nextFlushAt : opts.until + CLAIM_FLUSH_MS;
    let guard = 0;
    while (items.length > 0 && guard < 20) {
      flush(now);
      if (items.length === 0) break;
      now += CLAIM_FLUSH_MS;
      guard += 1;
    }
  }

  return { posts, rateLimits, postTimes, left: items.map((item) => item.h3) };
}

describe("upload simulation", () => {
  test("a fast run stays under the rate limit and keeps every hex", () => {
    const arrivals: Array<{ t: number; ids: string[] }> = [];
    for (let i = 0; i < 120; i += 1) {
      arrivals.push({ t: i * 400, ids: [`h${i}`] });
    }
    let windowStart = 0;
    let count = 0;
    const server: Server = (now, sent) => {
      if (now >= windowStart + 60_000) {
        windowStart = now;
        count = 0;
      }
      if (count >= 30) {
        return { kind: "rate", retryAfterMs: windowStart + 60_000 - now };
      }
      count += 1;
      return {
        kind: "ok",
        results: sent.map((h3) => ({ h3, alreadyOwned: false })),
      };
    };
    const result = simulate({ arrivals, until: 48_000, server });
    expect(result.left).toEqual([]);
    expect(result.rateLimits).toBe(0);
    expect(result.posts).toBeLessThanOrEqual(24);
    const firstMinute = result.postTimes.filter((t) => t < 60_000);
    expect(firstMinute.length).toBeLessThanOrEqual(30);
  });

  test("rate limits and a dropped connection still deliver the hexes", () => {
    const arrivals = [
      { t: 0, ids: ["a", "b", "c"] },
      { t: 1000, ids: ["d"] },
      { t: 3000, ids: ["e"] },
    ];
    let calls = 0;
    const server: Server = (_now, sent) => {
      calls += 1;
      if (calls === 1) return { kind: "rate", retryAfterMs: 2000 };
      if (calls === 2) return { kind: "retry" };
      return {
        kind: "ok",
        results: sent.map((h3) => ({ h3, alreadyOwned: false })),
      };
    };
    const result = simulate({ arrivals, until: 20_000, server });
    expect(result.left).toEqual([]);
    expect(result.rateLimits).toBe(1);
    expect(result.posts).toBeGreaterThanOrEqual(3);
  });

  test("a backlog is split into batches and nothing is skipped", () => {
    const ids = Array.from({ length: CLAIM_BATCH_MAX + 40 }, (_, i) => `b${i}`);
    const seen: string[] = [];
    const server: Server = (_now, sent) => {
      seen.push(...sent);
      return {
        kind: "ok",
        results: sent.map((h3) => ({ h3, alreadyOwned: false })),
      };
    };
    const result = simulate({
      arrivals: [{ t: 0, ids }],
      until: CLAIM_FLUSH_MS * 3,
      server,
    });
    expect(result.left).toEqual([]);
    expect(seen).toEqual(ids);
    expect(result.posts).toBe(2);
  });
});
