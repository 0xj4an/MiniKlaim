import { describe, expect, it } from "vitest";
import { blockAfter, drawWinners, poolAmount, prizePerWinner, revenueAmount } from "@/lib/challenges/math";

const USDT = (n: number) => BigInt(Math.round(n * 1e6));
const SEED = `0x${"ab".repeat(32)}` as const;
const addrs = Array.from({ length: 25 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);

describe("challenge money", () => {
  it("pool is seed + carry + 80% of entries; revenue is the rest", () => {
    const entries = USDT(20);
    expect(poolAmount({ seed: USDT(1), carry: 0n, entries, poolBps: 8000 })).toBe(USDT(17));
    expect(revenueAmount(entries, 8000)).toBe(USDT(4));
    expect(poolAmount({ seed: USDT(1), carry: USDT(5), entries, poolBps: 8000 })).toBe(USDT(22));
  });

  it("splits in equal parts and never over-pays", () => {
    expect(prizePerWinner(USDT(17), 10)).toBe(USDT(1.7));
    const p = prizePerWinner(1_000_001n, 3);
    expect(p * 3n).toBeLessThanOrEqual(1_000_001n);
    expect(prizePerWinner(USDT(5), 0)).toBe(0n);
  });
});

describe("drawWinners", () => {
  it("is reproducible, distinct and independent of input order", () => {
    const a = drawWinners(addrs, SEED, "w46", 10);
    const b = drawWinners([...addrs].reverse().map((x) => x.toUpperCase().replace("0X", "0x")), SEED, "w46", 10);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(10);
    expect(a.every((w) => addrs.includes(w))).toBe(true);
  });

  it("changes with the seed and the challenge", () => {
    const a = drawWinners(addrs, SEED, "w46", 10);
    expect(drawWinners(addrs, `0x${"cd".repeat(32)}`, "w46", 10)).not.toEqual(a);
    expect(drawWinners(addrs, SEED, "w47", 10)).not.toEqual(a);
  });

  it("everyone wins when fewer qualify than the winner slots", () => {
    expect(drawWinners(addrs.slice(0, 4), SEED, "w46", 10).sort()).toEqual(addrs.slice(0, 4));
    expect(drawWinners([], SEED, "w46", 10)).toEqual([]);
  });
});

describe("blockAfter", () => {
  it("adds the seconds and the margin", () => {
    expect(blockAfter(100n, 50)).toBe(750n);
    expect(blockAfter(100n, -5, 0)).toBe(100n);
  });
});
