import { describe, expect, it } from "vitest";
import {
  TOP_COLORS,
  rankForTopColor,
  topColorForRank,
  topColorMap,
} from "@/lib/map/topColors";
import { HEX_COLORS } from "@/lib/map/hexColors";

describe("topColorMap", () => {
  it("colors the first ten players, linked wallets included", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      address: `0xAA${i}`,
      linked: i === 0 ? ["0xBB0"] : [],
    }));
    const map = topColorMap(entries);
    expect(map.get("0xaa0")).toBe(TOP_COLORS[0]);
    expect(map.get("0xbb0")).toBe(TOP_COLORS[0]);
    expect(map.get("0xaa9")).toBe(TOP_COLORS[9]);
    expect(map.has("0xaa10")).toBe(false);
  });

  it("handles missing data", () => {
    expect(topColorMap(null).size).toBe(0);
  });

  it("ranks map to colors, only 1-10", () => {
    expect(topColorForRank(1)).toBe(TOP_COLORS[0]);
    expect(topColorForRank(10)).toBe(TOP_COLORS[9]);
    expect(topColorForRank(11)).toBeNull();
    expect(topColorForRank(0)).toBeNull();
  });

  it("uses ten distinct colors that are not the reserved ones", () => {
    const all = new Set(TOP_COLORS.map((c) => c.toLowerCase()));
    expect(all.size).toBe(10);
    for (const reserved of [
      HEX_COLORS.mine,
      HEX_COLORS.run,
      HEX_COLORS.others,
    ]) {
      expect(all.has(reserved.toLowerCase())).toBe(false);
    }
  });
});

describe("rankForTopColor", () => {
  it("is the inverse of topColorForRank inside the top ten", () => {
    for (let rank = 1; rank <= TOP_COLORS.length; rank += 1) {
      expect(rankForTopColor(topColorForRank(rank))).toBe(rank);
    }
  });

  it("is 0 for no color and for a color that is not a rank", () => {
    expect(rankForTopColor("")).toBe(0);
    expect(rankForTopColor(null)).toBe(0);
    expect(rankForTopColor(HEX_COLORS.others)).toBe(0);
  });
});
