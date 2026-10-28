import { describe, expect, it } from "vitest";
import { gpuSupportEvent, probeGpuSupport } from "./gpuSupport";

type Ctx = Record<string, unknown>;

function canvasWith(contexts: Record<string, Ctx | null>) {
  return () =>
    ({
      getContext: (name: string) => contexts[name] ?? null,
    }) as unknown as HTMLCanvasElement;
}

const RENDERER_PARAM = 37446;

function glContext(renderer: string | null, maxTextureSize = 4096): Ctx {
  return {
    MAX_TEXTURE_SIZE: 3379,
    getExtension: (name: string) => {
      if (name === "WEBGL_debug_renderer_info")
        return renderer === null ? null : { UNMASKED_RENDERER_WEBGL: RENDERER_PARAM };
      if (name === "WEBGL_lose_context") return { loseContext: () => {} };
      return null;
    },
    getParameter: (p: number) =>
      p === RENDERER_PARAM ? renderer : p === 3379 ? maxTextureSize : null,
  };
}

describe("probeGpuSupport", () => {
  it("reports WebGL2 when the phone has it", () => {
    const got = probeGpuSupport(
      canvasWith({ webgl2: glContext("Mali-G76"), webgl: glContext("Mali-G76") }),
    );
    expect(got.webgl).toBe(2);
    expect(got.renderer).toBe("Mali-G76");
    expect(got.maxTextureSize).toBe(4096);
  });

  it("falls back to WebGL1 — the phones MapLibre 6 would refuse", () => {
    const got = probeGpuSupport(canvasWith({ webgl2: null, webgl: glContext("Adreno (TM) 308") }));
    expect(got.webgl).toBe(1);
    expect(got.renderer).toBe("Adreno (TM) 308");
  });

  it("reports no WebGL at all", () => {
    const got = probeGpuSupport(canvasWith({ webgl2: null, webgl: null }));
    expect(got).toEqual({ webgl: 0, renderer: null, maxTextureSize: null });
  });

  it("still reports the level when the browser hides the GPU name", () => {
    const got = probeGpuSupport(canvasWith({ webgl2: glContext(null) }));
    expect(got.webgl).toBe(2);
    expect(got.renderer).toBeNull();
  });

  it("never throws when the canvas or context misbehaves", () => {
    const throwing = () => {
      throw new Error("no canvas");
    };
    expect(probeGpuSupport(throwing as unknown as () => HTMLCanvasElement).webgl).toBe(0);
    const badCtx = () =>
      ({
        getContext: () => {
          throw new Error("blocked");
        },
      }) as unknown as HTMLCanvasElement;
    expect(probeGpuSupport(badCtx).webgl).toBe(0);
  });
});

describe("gpuSupportEvent", () => {
  it("answers the MapLibre 6 question in the payload", () => {
    const e = gpuSupportEvent(
      { webgl: 2, renderer: "Mali-G76", maxTextureSize: 8192 },
      "/run",
    );
    expect(e).toEqual({
      webgl: 2,
      webgl2: true,
      renderer: "Mali-G76",
      max_texture_size: 8192,
      path: "/run",
    });
  });

  it("marks a WebGL1 phone as one MapLibre 6 would refuse", () => {
    const e = gpuSupportEvent(
      { webgl: 1, renderer: "Adreno (TM) 308", maxTextureSize: 4096 },
      "/community",
    );
    expect(e.webgl2).toBe(false);
    expect(e.webgl).toBe(1);
  });

  it("marks a phone with no WebGL at all", () => {
    expect(
      gpuSupportEvent({ webgl: 0, renderer: null, maxTextureSize: null }, "/me").webgl2,
    ).toBe(false);
  });
});
