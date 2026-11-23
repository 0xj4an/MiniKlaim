import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ATTRIBUTION_FOLD_MS,
  foldAttribution,
  foldAttributionLater,
} from "./attribution";

/** A stand-in for the map container holding MapLibre's compact credit. */
function mapWithCredit(open: boolean) {
  const credit = {
    open,
    classes: new Set(
      open
        ? ["maplibregl-ctrl-attrib", "maplibregl-compact-show"]
        : ["maplibregl-ctrl-attrib"],
    ),
    removeAttribute(name: string) {
      if (name === "open") this.open = false;
    },
    classList: {
      remove: (name: string) => {
        credit.classes.delete(name);
      },
    },
  };
  const container = {
    querySelector: (selector: string) =>
      selector.includes("maplibregl-compact-show") &&
      credit.classes.has("maplibregl-compact-show")
        ? credit
        : null,
  };
  return { credit, container, getContainer: () => container };
}

afterEach(() => vi.useRealTimers());

describe("map credit", () => {
  it("folds an open compact credit and keeps the control", () => {
    const { credit, container } = mapWithCredit(true);
    expect(foldAttribution(container)).toBe(true);
    expect(credit.open).toBe(false);
    expect(credit.classes.has("maplibregl-compact-show")).toBe(false);
    expect(credit.classes.has("maplibregl-ctrl-attrib")).toBe(true);
  });

  it("leaves a credit that is already folded alone", () => {
    const { container } = mapWithCredit(false);
    expect(foldAttribution(container)).toBe(false);
  });

  it("waits the five seconds the guidelines allow", () => {
    vi.useFakeTimers();
    const map = mapWithCredit(true);
    foldAttributionLater(map);
    vi.advanceTimersByTime(ATTRIBUTION_FOLD_MS - 1);
    expect(map.credit.open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(map.credit.open).toBe(false);
  });

  it("does nothing once cancelled", () => {
    vi.useFakeTimers();
    const map = mapWithCredit(true);
    const cancel = foldAttributionLater(map);
    cancel();
    vi.advanceTimersByTime(ATTRIBUTION_FOLD_MS * 2);
    expect(map.credit.open).toBe(true);
  });

  it("survives a map that was removed before the timer ran", () => {
    vi.useFakeTimers();
    foldAttributionLater({
      getContainer: () => {
        throw new Error("map removed");
      },
    });
    expect(() => vi.advanceTimersByTime(ATTRIBUTION_FOLD_MS)).not.toThrow();
  });
});
