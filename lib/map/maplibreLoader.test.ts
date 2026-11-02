import { beforeEach, describe, expect, it, vi } from "vitest";

const mapRenderFailed = vi.fn();
vi.mock("@/lib/map/mapTelemetry", () => ({
  mapRenderFailed: (...a: unknown[]) => mapRenderFailed(...a),
}));

const v6 = {
  Map: class V6Map {},
  Popup: class V6Popup {},
  setWorkerUrl: vi.fn(),
};
vi.mock("maplibre-gl", () => v6);

// The alias keeps v5's default export, which is the namespace.
const v5ns = { Map: class V5Map {}, Popup: class V5Popup {} };
vi.mock("maplibre-gl-v5", () => ({ default: v5ns }));

import {
  loadMaplibre,
  MAPLIBRE_MAJOR,
  resetMaplibreCache,
} from "./maplibreLoader";

describe("loadMaplibre", () => {
  beforeEach(() => {
    resetMaplibreCache();
    mapRenderFailed.mockReset();
    v6.setWorkerUrl.mockReset();
  });

  it("gives WebGL2 phones the current major", async () => {
    const mod = await loadMaplibre("gl2")!;
    expect(mod.Map).toBe(v6.Map);
    expect(MAPLIBRE_MAJOR.gl2).toBe(6);
  });

  it("gives WebGL1 phones the last major that supports them", async () => {
    // 27 players with a working map and 40 runs behind it. Version 6 would
    // refuse to build it, and the advisory it closes is not reachable here.
    const mod = await loadMaplibre("gl1")!;
    expect(mod.Map).toBe(v5ns.Map);
    expect(mod.Popup).toBe(v5ns.Popup);
    expect(MAPLIBRE_MAJOR.gl1).toBe(5);
  });

  it("loads no map bundle at all on the grid tier", async () => {
    // The download and the parse are what hurt most on those phones.
    expect(loadMaplibre("grid")).toBeNull();
  });

  it("loads each major once, however many maps a page builds", async () => {
    const a = loadMaplibre("gl2");
    const b = loadMaplibre("gl2");
    expect(a).toBe(b);
    await a;
    expect(await loadMaplibre("gl2")).toBe(await b!);
  });

  it("tells v6 where its worker is, since a bundler hides it", async () => {
    await loadMaplibre("gl2");
    expect(v6.setWorkerUrl).toHaveBeenCalledTimes(1);
    expect(String(v6.setWorkerUrl.mock.calls[0][0])).toContain(
      "maplibre-gl-worker",
    );
  });

  it("reports an import failure as import, not as the GPU refusing", async () => {
    vi.doMock("maplibre-gl-v5", () => {
      throw new Error("chunk missing");
    });
    vi.resetModules();
    const { loadMaplibre: fresh } = await import("./maplibreLoader");
    await expect(fresh("gl1")!).rejects.toThrow();
    expect(mapRenderFailed).toHaveBeenCalledWith(
      "gl1",
      "maplibre",
      "load",
      "import",
      expect.anything(),
    );
    vi.doUnmock("maplibre-gl-v5");
  });

  it("lets a later load retry after a failed one", async () => {
    vi.doMock("maplibre-gl-v5", () => {
      throw new Error("offline");
    });
    vi.resetModules();
    const { loadMaplibre: fresh } = await import("./maplibreLoader");
    await expect(fresh("gl1")!).rejects.toThrow();
    // A cached rejection would leave the player mapless for the whole
    // session over one failed chunk request.
    await expect(fresh("gl1")!).rejects.toThrow();
    expect(mapRenderFailed).toHaveBeenCalledTimes(2);
    vi.doUnmock("maplibre-gl-v5");
  });
});
