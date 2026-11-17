import { describe, expect, it } from "vitest";
import { bearingDegrees, nextCourse, type CourseState } from "./course";

const start = { lat: 6.2518, lng: -75.5636 };
// One thousandth of a degree is about 110 m here.
const north = { lat: 6.2528, lng: -75.5636 };
const east = { lat: 6.2518, lng: -75.5626 };
const fresh: CourseState = { anchor: null, course: null };

describe("bearingDegrees", () => {
  it("reads the four directions", () => {
    expect(bearingDegrees(start, north)).toBeCloseTo(0, 0);
    expect(bearingDegrees(start, east)).toBeCloseTo(90, 0);
    expect(bearingDegrees(north, start)).toBeCloseTo(180, 0);
    expect(bearingDegrees(east, start)).toBeCloseTo(270, 0);
  });
});

describe("nextCourse", () => {
  it("has no direction on the first fix", () => {
    expect(nextCourse(fresh, start)).toEqual({ anchor: start, course: null });
  });

  it("takes the bearing between fixes once the player has moved", () => {
    const first = nextCourse(fresh, start);
    const second = nextCourse(first, east);
    expect(second.course).toBeCloseTo(90, 0);
    expect(second.anchor).toEqual(east);
  });

  it("does not spin the map on GPS wander while standing still", () => {
    const first = nextCourse(nextCourse(fresh, start), east);
    // Three metres to the side: inside the wander of a good fix.
    const wobble = { lat: east.lat + 0.00003, lng: east.lng };
    expect(nextCourse(first, wobble)).toBe(first);
  });

  it("trusts the phone's heading at walking speed", () => {
    const out = nextCourse(fresh, { ...start, heading: 213, speed: 1.4 });
    expect(out.course).toBe(213);
  });

  it("ignores the phone's heading when it is not moving", () => {
    // A stopped phone reports a heading of 0 or NaN, which is not north.
    const first = nextCourse(nextCourse(fresh, start), east);
    expect(nextCourse(first, { ...east, heading: 0, speed: 0 }).course).toBeCloseTo(90, 0);
    expect(nextCourse(first, { ...east, heading: NaN, speed: 2 }).course).toBeCloseTo(90, 0);
  });
});
