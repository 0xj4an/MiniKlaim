import { describe, expect, it } from "vitest";
import {
  cumulativeMeters,
  formatNavDistance,
  formatNavMinutes,
  navProgress,
  OFF_ROUTE_METERS,
} from "./progress";
import type { NavRoute } from "./types";

// An L: about 111 m north, then about 110 m east.
const route: NavRoute = {
  coords: [
    [-75.57, 6.2],
    [-75.57, 6.201],
    [-75.569, 6.201],
  ],
  distanceM: 221,
  durationS: 160,
  steps: [
    { text: "Head north", at: 0, distanceM: 111 },
    { text: "Turn right", at: 1, distanceM: 110 },
    { text: "You have arrived", at: 2, distanceM: 0 },
  ],
};
const cumulative = cumulativeMeters(route.coords);

describe("cumulativeMeters", () => {
  it("adds up the line", () => {
    expect(cumulative[0]).toBe(0);
    expect(cumulative[1]).toBeGreaterThan(105);
    expect(cumulative[1]).toBeLessThan(115);
    expect(cumulative[2]).toBeGreaterThan(215);
    expect(cumulative[2]).toBeLessThan(226);
  });
});

describe("navProgress", () => {
  it("at the start the whole way is left and the turn is next", () => {
    const p = navProgress(route, cumulative, { lat: 6.2, lng: -75.57 });
    expect(p.offRouteM).toBeLessThan(1);
    expect(p.remainingM).toBeCloseTo(cumulative[2], 0);
    expect(p.nextStep?.text).toBe("Turn right");
    expect(p.toNextStepM).toBeCloseTo(cumulative[1], 0);
    expect(p.arrived).toBe(false);
  });

  it("halfway up the first street the turn is half as far", () => {
    const p = navProgress(route, cumulative, { lat: 6.2005, lng: -75.57 });
    expect(p.nextStep?.text).toBe("Turn right");
    expect(p.toNextStepM).toBeGreaterThan(50);
    expect(p.toNextStepM).toBeLessThan(60);
  });

  it("after the turn the next thing is arriving", () => {
    const p = navProgress(route, cumulative, { lat: 6.201, lng: -75.5695 });
    expect(p.nextStep?.text).toBe("You have arrived");
    expect(p.remainingM).toBeGreaterThan(50);
    expect(p.remainingM).toBeLessThan(60);
    expect(p.arrived).toBe(false);
  });

  it("arrives near the end of the line", () => {
    const p = navProgress(route, cumulative, { lat: 6.20101, lng: -75.56905 });
    expect(p.arrived).toBe(true);
    expect(p.remainingM).toBeLessThan(10);
  });

  it("measures how far off the line a parallel street is", () => {
    // About 110 m west of the first street.
    const p = navProgress(route, cumulative, { lat: 6.2005, lng: -75.571 });
    expect(p.offRouteM).toBeGreaterThan(OFF_ROUTE_METERS);
    expect(p.offRouteM).toBeGreaterThan(100);
    expect(p.offRouteM).toBeLessThan(120);
  });

  it("a GPS wobble on the same street is not off the line", () => {
    // About 11 m to the side.
    const p = navProgress(route, cumulative, { lat: 6.2005, lng: -75.5701 });
    expect(p.offRouteM).toBeLessThan(OFF_ROUTE_METERS);
  });
});

describe("formatting", () => {
  it("rounds metres to tens and switches to km", () => {
    expect(formatNavDistance(4)).toBe("10 m");
    expect(formatNavDistance(347)).toBe("350 m");
    expect(formatNavDistance(2449)).toBe("2.4 km");
    expect(formatNavDistance(12_600)).toBe("13 km");
    expect(formatNavDistance(Number.NaN)).toBe("");
  });

  it("never says zero minutes", () => {
    expect(formatNavMinutes(10)).toBe(1);
    expect(formatNavMinutes(150)).toBe(3);
  });
});
