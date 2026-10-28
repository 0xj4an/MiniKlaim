"use client";

import { track } from "@/lib/analytics";

/**
 * What the phone's GPU can actually do, so the MapLibre 6 question can be
 * answered with numbers instead of a guess.
 *
 * MapLibre 6 drops WebGL1 and refuses to build a map without WebGL2. We tried
 * it on 27 Oct and rolled back the same night, because the only evidence to
 * hand was that of the players whose Android version we know, nearly all sit
 * on 7.x and 8.x — the generation where WebGL2 is often missing or blacklisted
 * — and `$os_version` is absent for most of the rest. The advisory v6 fixes
 * (GHSA-jrc7-96c5-q579) is not reachable here, so there was nothing to buy
 * with those players' maps.
 *
 * This records the capability on every map page so that in a month we know
 * the real share. `renderer` is the GPU string, which is what driver
 * blacklists key on; browsers that consider it fingerprinting return nothing,
 * so it is nullable by design.
 */

export type WebglLevel = 2 | 1 | 0;

export type GpuSupport = {
  webgl: WebglLevel;
  renderer: string | null;
  maxTextureSize: number | null;
};

type CanvasFactory = () => HTMLCanvasElement;

const defaultCanvas: CanvasFactory = () => {
  // 1x1: the probe only asks what the driver supports, it never draws.
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  return c;
};

export function probeGpuSupport(makeCanvas: CanvasFactory = defaultCanvas): GpuSupport {
  let canvas: HTMLCanvasElement;
  try {
    canvas = makeCanvas();
  } catch {
    return { webgl: 0, renderer: null, maxTextureSize: null };
  }

  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let webgl: WebglLevel = 0;
  try {
    gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
    if (gl) webgl = 2;
    else {
      gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
      if (gl) webgl = 1;
    }
  } catch {
    return { webgl: 0, renderer: null, maxTextureSize: null };
  }
  if (!gl) return { webgl: 0, renderer: null, maxTextureSize: null };

  let renderer: string | null = null;
  let maxTextureSize: number | null = null;
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) {
      const value: unknown = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      if (typeof value === "string") renderer = value.slice(0, 120);
    }
    const size: unknown = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (typeof size === "number") maxTextureSize = size;
  } catch {
    // Reading parameters is best effort; the level is the number that matters.
  }

  // A phone that ran out of memory on the map once should not pay for this
  // probe, so the context goes back immediately.
  try {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Nothing to do; the context is dropped with the canvas anyway.
  }

  return { webgl, renderer, maxTextureSize };
}

/** The payload, kept separate from the browser so it can be tested. */
export function gpuSupportEvent(support: GpuSupport, path: string) {
  return {
    webgl: support.webgl,
    // The question this exists to answer: would MapLibre 6 build a map here?
    webgl2: support.webgl === 2,
    renderer: support.renderer,
    max_texture_size: support.maxTextureSize,
    path,
  };
}

let reported = false;

/** Report once per page load, just before the first map is built. */
export function reportGpuSupport(path: string): void {
  if (reported || typeof window === "undefined") return;
  reported = true;
  track("map_gpu_support", gpuSupportEvent(probeGpuSupport(), path));
}
