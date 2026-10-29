import { describe, expect, it, vi } from "vitest";
import { createSharedCache } from "@/lib/sharedCache";

describe("createSharedCache", () => {
  it("loads once and serves the copy inside the TTL", async () => {
    const cache = createSharedCache<number>(60_000);
    const load = vi.fn(async () => 1);
    expect(await cache.get("k", load)).toBe(1);
    expect(await cache.get("k", load)).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  // Without this, a cold cache under traffic runs the expensive query once
  // per request instead of once.
  it("gives concurrent callers one shared load", async () => {
    const cache = createSharedCache<string>(60_000);
    let release: (v: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((r) => (release = r)));
    const a = cache.get("k", load);
    const b = cache.get("k", load);
    release("done");
    expect(await a).toBe("done");
    expect(await b).toBe("done");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps keys apart", async () => {
    const cache = createSharedCache<string>(60_000);
    expect(await cache.get("a", async () => "A")).toBe("A");
    expect(await cache.get("b", async () => "B")).toBe("B");
    expect(cache.size()).toBe(2);
  });

  it("reloads once the TTL has passed", async () => {
    vi.useFakeTimers();
    try {
      const cache = createSharedCache<number>(1_000);
      let n = 0;
      const load = async () => ++n;
      expect(await cache.get("k", load)).toBe(1);
      vi.advanceTimersByTime(1_001);
      expect(await cache.get("k", load)).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // A rejected load must not pin every later caller to the same error.
  it("lets the next caller retry after a failure", async () => {
    const cache = createSharedCache<string>(60_000);
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    await expect(cache.get("k", load)).rejects.toThrow("boom");
    expect(await cache.get("k", load)).toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
