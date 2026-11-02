import type { ClaimedHexFeatureCollection } from "@/lib/map/hex";
import { HEX_COLORS, LEVEL_DARK } from "@/lib/map/hexColors";
import { project, type LngLat, type Size } from "@/lib/map/mercator";

/**
 * The map for phones with no WebGL at all.
 *
 * Seven players ran 39 times in 30 days and saw 36 map failures, so they have
 * been playing blind. There is no GPU to fall back to, which rules out tiles:
 * the style in use is vector, and a raster basemap would mean another tile
 * provider with its own licence, key and cost. So this draws the game and not
 * the city: the blocks, who holds them, their level, and where the player is.
 *
 * On a run that is most of what the WebGL map was being read for anyway, and
 * it costs no GPU, no tile requests and no megabytes on a phone that has
 * little of any of them.
 *
 * The context is typed to the handful of calls used, not to
 * CanvasRenderingContext2D, so the drawing can be tested without a DOM. That
 * is the only way this tier gets tested at all: nobody on the team has a
 * phone that lands in it.
 */
export type DrawContext = {
  canvas?: { width: number; height: number };
  // Widened the way the real 2D context types them, so a
  // CanvasRenderingContext2D satisfies this without a cast.
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  save(): void;
  restore(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  arc(x: number, y: number, r: number, from: number, to: number): void;
};

export type GridScene = {
  hexes: ClaimedHexFeatureCollection;
  center: LngLat;
  zoom: number;
  size: Size;
  /** Where the player is, when there is a fix. Drawn last, over everything. */
  position: LngLat | null;
  /** Light or dark, since this draws its own background with no basemap. */
  theme?: "light" | "dark";
};

const BACKGROUND = { light: "#F4F4F5", dark: "#18181B" } as const;
const GRIDLINE = { light: "#E4E4E7", dark: "#27272A" } as const;

/** A block's level, 1 to 10, the same floor the WebGL style applies. */
export function levelOf(strength: unknown): number {
  const n = typeof strength === "number" && Number.isFinite(strength) ? strength : 1;
  return Math.min(10, Math.max(1, n));
}

/**
 * Blend two hex colours. The WebGL style darkens a block with its level
 * through an `interpolate` expression, which has no meaning off the GPU, so
 * the same ramp is computed here and the two maps agree.
 */
export function mixHex(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const k = Math.min(1, Math.max(0, t));
  const ch = (x: number, y: number) => Math.round(x + (y - x) * k);
  return rgbToHex(ch(a[0], b[0]), ch(a[1], b[1]), ch(a[2], b[2]));
}

function parseHex(value: string): [number, number, number] {
  const v = value.replace("#", "");
  const full =
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** The fill for a block: whose it is, darkened by its level. */
export function fillFor(props: {
  isMine?: boolean;
  isRun?: boolean;
  strength?: number;
  topColor?: string;
}): string {
  if (props.isRun) return HEX_COLORS.run;
  const t = (levelOf(props.strength) - 1) / 9;
  if (props.isMine) return mixHex(HEX_COLORS.mine, LEVEL_DARK.mine, t);
  if (props.topColor) return props.topColor;
  return mixHex(HEX_COLORS.others, LEVEL_DARK.others, t);
}

/**
 * Draw the scene. Returns how many blocks were drawn, which is what the
 * caller reports: a map that drew nothing is a different problem from a map
 * that threw, and on this tier the difference is invisible to the player.
 */
export function drawGrid(ctx: DrawContext, scene: GridScene): number {
  const theme = scene.theme ?? "light";
  const { width, height } = scene.size;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = BACKGROUND[theme];
  ctx.fillRect(0, 0, width, height);

  // A faint reference grid, so an empty area still reads as a map and not as
  // a blank screen that failed to load. Every pixel of this tier has to say
  // "this is working".
  drawReference(ctx, scene, GRIDLINE[theme]);

  let drawn = 0;
  for (const feature of scene.hexes.features) {
    const ring = feature.geometry?.coordinates?.[0];
    if (!ring || ring.length < 3) continue;

    ctx.beginPath();
    let visible = false;
    for (let i = 0; i < ring.length; i++) {
      const point = project(ring[i] as LngLat, scene.center, scene.zoom, scene.size);
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
      if (
        point.x >= -64 &&
        point.x <= width + 64 &&
        point.y >= -64 &&
        point.y <= height + 64
      ) {
        visible = true;
      }
    }
    ctx.closePath();
    // Off-screen blocks are skipped only after the path is built, because the
    // path has to be consumed either way for the next beginPath to be clean.
    if (!visible) continue;

    const props: Partial<{
      isMine: boolean;
      isRun: boolean;
      strength: number;
      topColor: string;
    }> = feature.properties ?? {};
    ctx.globalAlpha = props.isMine || props.isRun ? 0.55 : 0.35;
    ctx.fillStyle = fillFor(props);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = fillFor(props);
    ctx.lineWidth = levelOf(props.strength) >= 10 ? 2.5 : 1;
    ctx.stroke();
    drawn++;
  }

  if (scene.position) {
    const p = project(scene.position, scene.center, scene.zoom, scene.size);
    // A white ring under the dot, so it stays visible over an orange block
    // the player already owns.
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = HEX_COLORS.here;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#2563EB";
    ctx.fill();
  }

  ctx.restore();
  return drawn;
}

/**
 * Lines every 100 pixels. Not a graticule: at this zoom a degree grid would
 * be either invisible or the whole screen, and the point is only to give the
 * eye something that moves when the player moves.
 */
function drawReference(ctx: DrawContext, scene: GridScene, color: string): void {
  const { width, height } = scene.size;
  const step = 100;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (let x = 0; x <= width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}
