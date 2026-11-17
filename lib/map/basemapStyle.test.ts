import { describe, expect, it } from "vitest";
import {
  FALLBACK_STYLE,
  inlineTileJson,
  isUsableStyle,
  isUsableTileJson,
  tileJsonSources,
  type BasemapStyle,
} from "./basemapStyle";

describe("isUsableStyle", () => {
  it("accepts the style the tile host actually serves", () => {
    expect(
      isUsableStyle({
        version: 8,
        sources: { openmaptiles: { type: "vector", url: "https://example" } },
        layers: [{ id: "background", type: "background" }],
      }),
    ).toBe(true);
  });

  it("accepts our own fallback, so the two cannot disagree", () => {
    expect(isUsableStyle(FALLBACK_STYLE)).toBe(true);
  });

  it("rejects the ways a 200 response is still not a style", () => {
    // An upstream error page, a proxy's JSON, a truncated body and a future
    // style version all parse. Handing any of them to the constructor throws
    // on exactly the phones least able to recover, so they are caught here.
    expect(isUsableStyle({ error: "not found" })).toBe(false);
    expect(
      isUsableStyle({ version: 9, sources: {}, layers: [{ id: "a" }] }),
    ).toBe(false);
    expect(isUsableStyle({ version: 8, sources: {} })).toBe(false);
    expect(isUsableStyle({ version: 8, sources: {}, layers: [] })).toBe(false);
    expect(isUsableStyle({ version: 8, layers: [{ id: "a" }] })).toBe(false);
    // A layer with no id is one MapLibre cannot address.
    expect(
      isUsableStyle({ version: 8, sources: {}, layers: [{ type: "fill" }] }),
    ).toBe(false);
  });

  it("rejects what is not an object at all", () => {
    expect(isUsableStyle(null)).toBe(false);
    expect(isUsableStyle(undefined)).toBe(false);
    expect(isUsableStyle("<!doctype html>")).toBe(false);
  });
});

describe("FALLBACK_STYLE", () => {
  it("asks for no network at all", () => {
    // The whole point: a map built from this needs nothing from anyone. If a
    // source ever appears here, the fallback has a dependency and stops being
    // a fallback.
    expect(Object.keys(FALLBACK_STYLE.sources)).toHaveLength(0);
    expect(JSON.stringify(FALLBACK_STYLE)).not.toContain("http");
  });
});

describe("inlineTileJson", () => {
  const style = {
    version: 8,
    sources: {
      openmaptiles: { type: "vector", url: "https://tiles.example/planet" },
      shaded: {
        type: "raster",
        tiles: ["https://tiles.example/ne/{z}/{x}/{y}.png"],
        tileSize: 256,
      },
    },
    layers: [{ id: "background", type: "background" }],
  } as unknown as BasemapStyle;
  const doc = {
    tilejson: "3.0.0",
    tiles: ["https://tiles.example/planet/20261115/{z}/{x}/{y}.pbf"],
    minzoom: 0,
    maxzoom: 14,
    bounds: [-180, -85, 180, 85],
    attribution: "OpenStreetMap",
    vector_layers: [{ id: "water" }],
  };

  it("finds the sources that send the phone to ask where the tiles are", () => {
    expect(tileJsonSources(style)).toEqual([
      { id: "openmaptiles", url: "https://tiles.example/planet" },
    ]);
  });

  it("writes the tiles into the source and drops the lookup", () => {
    const out = inlineTileJson(style, { openmaptiles: doc });
    expect(out.sources.openmaptiles).toEqual({
      type: "vector",
      tiles: doc.tiles,
      minzoom: 0,
      maxzoom: 14,
      bounds: [-180, -85, 180, 85],
      attribution: "OpenStreetMap",
    });
    expect(tileJsonSources(out)).toEqual([]);
    expect(isUsableStyle(out)).toBe(true);
  });

  it("leaves the other sources and the input alone", () => {
    const out = inlineTileJson(style, { openmaptiles: doc });
    expect(out.sources.shaded).toEqual(style.sources.shaded);
    expect(style.sources.openmaptiles).toEqual({
      type: "vector",
      url: "https://tiles.example/planet",
    });
  });

  it("keeps the lookup when the server could not get the document", () => {
    for (const bad of [undefined, null, {}, { tiles: [] }, { tiles: ["ftp://x"] }, "oops"]) {
      const out = inlineTileJson(style, { openmaptiles: bad });
      expect(out.sources.openmaptiles).toEqual(style.sources.openmaptiles);
    }
  });

  it("only trusts a document that names https tiles", () => {
    expect(isUsableTileJson(doc)).toBe(true);
    expect(isUsableTileJson({ tiles: ["http://plain.example/{z}"] })).toBe(false);
    expect(isUsableTileJson({ tiles: "https://x" })).toBe(false);
  });
});
