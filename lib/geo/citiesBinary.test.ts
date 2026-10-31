import { describe, expect, it } from "vitest";
import {
  type CityInput,
  cityName,
  countryRange,
  decodeCities,
  encodeCities,
} from "@/lib/geo/citiesBinary";

const SAMPLE: CityInput[] = [
  { name: "Medellín", country: "CO", lat: 6.2518, lon: -75.5636, population: 2427129 },
  { name: "Bogotá", country: "CO", lat: 4.711, lon: -74.0721, population: 7674366 },
  { name: "Lagos", country: "NG", lat: 6.4541, lon: 3.3947, population: 9000000 },
  { name: "Ibadan", country: "NG", lat: 7.3775, lon: 3.947, population: 3649000 },
  { name: "Åsgårdstrand", country: "NO", lat: 59.35, lon: 10.4667, population: 2300 },
];

function roundTrip(input: CityInput[]) {
  return decodeCities(encodeCities(input));
}

describe("cities binary table", () => {
  it("keeps every city and every field", () => {
    const t = roundTrip(SAMPLE);
    expect(t.cityCount).toBe(SAMPLE.length);
    const seen = new Map<string, CityInput>();
    for (let i = 0; i < t.cityCount; i++) {
      seen.set(cityName(t, i), {
        name: cityName(t, i),
        country: "",
        lat: t.lat[i],
        lon: t.lon[i],
        population: t.population[i],
      });
    }
    for (const c of SAMPLE) {
      const got = seen.get(c.name);
      expect(got, c.name).toBeDefined();
      expect(got!.lat).toBeCloseTo(c.lat, 4);
      expect(got!.lon).toBeCloseTo(c.lon, 4);
      expect(got!.population).toBe(c.population);
    }
  });

  it("round-trips names that are not ASCII", () => {
    const t = roundTrip(SAMPLE);
    const names = Array.from({ length: t.cityCount }, (_, i) => cityName(t, i));
    expect(names).toContain("Medellín");
    expect(names).toContain("Bogotá");
    expect(names).toContain("Åsgårdstrand");
  });

  it("gives each country a contiguous range holding only its cities", () => {
    const t = roundTrip(SAMPLE);
    for (const [iso2, expected] of [
      ["CO", ["Bogotá", "Medellín"]],
      ["NG", ["Lagos", "Ibadan"]],
      ["NO", ["Åsgårdstrand"]],
    ] as const) {
      const range = countryRange(t, iso2);
      expect(range, iso2).not.toBeNull();
      const [from, to] = range!;
      const names = [];
      for (let i = from; i < to; i++) names.push(cityName(t, i));
      expect(new Set(names)).toEqual(new Set(expected));
    }
  });

  it("returns null for a country that is not in the table", () => {
    expect(countryRange(roundTrip(SAMPLE), "ZZ")).toBeNull();
  });

  it("orders a country's cities by population, biggest first", () => {
    const t = roundTrip(SAMPLE);
    const [from, to] = countryRange(t, "CO")!;
    expect(cityName(t, from)).toBe("Bogotá");
    expect(to - from).toBe(2);
  });

  it("refuses a buffer that is not a city table", () => {
    expect(() => decodeCities(new Uint8Array(32))).toThrow(/MKC1/);
  });

  it("decodes correctly from an unaligned slice", () => {
    // readFileSync hands back a view into a shared pool, so byteOffset is
    // whatever it happens to be; a Float32Array view would throw on an
    // offset that is not a multiple of 4.
    const encoded = encodeCities(SAMPLE);
    const pool = new Uint8Array(encoded.length + 3);
    pool.set(encoded, 3);
    const t = decodeCities(pool.subarray(3));
    expect(t.cityCount).toBe(SAMPLE.length);
    expect(cityName(t, countryRange(t, "CO")![0])).toBe("Bogotá");
  });

  it("clamps a nonsense population instead of wrapping it", () => {
    const t = roundTrip([
      { name: "A", country: "AA", lat: 0, lon: 0, population: -5 },
      { name: "B", country: "AB", lat: 0, lon: 0, population: 1e12 },
    ]);
    expect(t.population[countryRange(t, "AA")![0]]).toBe(0);
    expect(t.population[countryRange(t, "AB")![0]]).toBe(0xffffffff);
  });

  it("handles an empty table", () => {
    const t = roundTrip([]);
    expect(t.cityCount).toBe(0);
    expect(countryRange(t, "CO")).toBeNull();
  });
});
