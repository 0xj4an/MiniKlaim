import { describe, expect, it } from "vitest";
import { FALLBACK_STYLE, isUsableStyle } from "./basemapStyle";

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
