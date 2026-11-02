import { describe, expect, it, vi } from "vitest";
import { drawGrid, fillFor, levelOf, mixHex, type DrawContext, type GridScene } from "./gridDraw";
import { HEX_COLORS, LEVEL_DARK } from "./hexColors";
import type { ClaimedHexFeatureCollection } from "./hex";

function fakeContext() {
  const calls: string[] = [];
  const ctx: DrawContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    save: vi.fn(() => void calls.push("save")),
    restore: vi.fn(() => void calls.push("restore")),
    clearRect: vi.fn(() => void calls.push("clearRect")),
    fillRect: vi.fn(() => void calls.push("fillRect")),
    beginPath: vi.fn(() => void calls.push("beginPath")),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => void calls.push("fill")),
    stroke: vi.fn(() => void calls.push("stroke")),
    arc: vi.fn(() => void calls.push("arc")),
  };
  return { ctx, calls };
}

const CENTER: [number, number] = [-75.5636, 6.2518];

/** A square standing in for a hex ring, centred on `at`. */
function cell(at: [number, number], props: Record<string, unknown> = {}) {
  const d = 0.0005;
  return {
    type: "Feature" as const,
    properties: { hex: "8a2a", owner: "0x1", ownerUsername: null, isMine: false, isRun: false, strength: 1, topColor: "", ...props },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [at[0] - d, at[1] - d],
          [at[0] + d, at[1] - d],
          [at[0] + d, at[1] + d],
          [at[0] - d, at[1] + d],
          [at[0] - d, at[1] - d],
        ],
      ],
    },
  };
}

function scene(features: unknown[], position: [number, number] | null = null): GridScene {
  return {
    hexes: { type: "FeatureCollection", features } as unknown as ClaimedHexFeatureCollection,
    center: CENTER,
    zoom: 16,
    size: { width: 400, height: 800 },
    position,
  };
}

describe("levelOf", () => {
  it("treats a block with no level as level 1, as the GPU style does", () => {
    expect(levelOf(undefined)).toBe(1);
    expect(levelOf(null)).toBe(1);
  });

  it("holds the 1 to 10 range", () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(99)).toBe(10);
    expect(levelOf(7)).toBe(7);
  });
});

describe("mixHex", () => {
  it("returns the ends unchanged", () => {
    expect(mixHex("#F97316", "#9A3412", 0)).toBe("#f97316");
    expect(mixHex("#F97316", "#9A3412", 1)).toBe("#9a3412");
  });

  it("clamps rather than extrapolating past the ramp", () => {
    expect(mixHex("#000000", "#ffffff", 5)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", -3)).toBe("#000000");
  });

  it("accepts the short form", () => {
    expect(mixHex("#fff", "#000", 0)).toBe("#ffffff");
  });
});

describe("fillFor", () => {
  it("paints this run's captures red, whatever their level", () => {
    expect(fillFor({ isRun: true, isMine: true, strength: 9 })).toBe(HEX_COLORS.run);
  });

  it("darkens the player's own blocks with their level", () => {
    expect(fillFor({ isMine: true, strength: 1 })).toBe("#f97316");
    expect(fillFor({ isMine: true, strength: 10 })).toBe(LEVEL_DARK.mine.toLowerCase());
  });

  it("keeps a top-ten player's own colour", () => {
    expect(fillFor({ topColor: "#123456" })).toBe("#123456");
  });

  it("falls back to the neutral ramp for everyone else", () => {
    expect(fillFor({ strength: 1 })).toBe("#9ca3af");
  });
});

describe("drawGrid", () => {
  it("paints its own background, since there is no basemap under it", () => {
    const { ctx, calls } = fakeContext();
    drawGrid(ctx, scene([]));
    expect(calls).toContain("clearRect");
    expect(calls).toContain("fillRect");
  });

  it("draws the blocks it was given and says how many", () => {
    const { ctx } = fakeContext();
    const drawn = drawGrid(ctx, scene([cell(CENTER), cell([CENTER[0] + 0.001, CENTER[1]])]));
    expect(drawn).toBe(2);
  });

  it("skips blocks far outside the view", () => {
    // A world list can hold hundreds of thousands of blocks; drawing the ones
    // nobody can see is how a phone with no GPU locks up.
    const { ctx } = fakeContext();
    expect(drawGrid(ctx, scene([cell([20, 50]), cell(CENTER)]))).toBe(1);
  });

  it("ignores a feature with no usable ring instead of throwing", () => {
    const { ctx } = fakeContext();
    const broken = [
      { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } },
      { type: "Feature", properties: {}, geometry: null },
      cell(CENTER),
    ];
    expect(drawGrid(ctx, scene(broken))).toBe(1);
  });

  it("draws the player on top of the blocks", () => {
    const { ctx, calls } = fakeContext();
    drawGrid(ctx, scene([cell(CENTER)], CENTER));
    expect(calls.lastIndexOf("arc")).toBeGreaterThan(calls.indexOf("stroke"));
    // A ring and a dot, so the position stays visible over an owned block.
    expect(calls.filter((c) => c === "arc")).toHaveLength(2);
  });

  it("leaves no transparency behind for the next frame", () => {
    const { ctx } = fakeContext();
    drawGrid(ctx, scene([cell(CENTER, { isMine: true })], CENTER));
    expect(ctx.globalAlpha).toBe(1);
  });

  it("draws a dark background when asked", () => {
    const { ctx } = fakeContext();
    const light = fakeContext();
    drawGrid(light.ctx, scene([]));
    drawGrid(ctx, { ...scene([]), theme: "dark" });
    expect(ctx.fillStyle).not.toBe(light.ctx.fillStyle);
  });
});
