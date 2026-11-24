import { describe, expect, it } from "vitest";
import {
  navLang,
  parsePlaces,
  parseRoute,
  routeUrl,
  searchUrl,
} from "./geoapify";

describe("geoapify request urls", () => {
  it("search biases toward the player with longitude first", () => {
    const url = new URL(
      searchUrl({
        text: "Parque Lleras",
        near: { lat: 6.2087, lng: -75.5674 },
        lang: "es",
        apiKey: "k",
      }),
    );
    expect(url.pathname).toBe("/v1/geocode/autocomplete");
    expect(url.searchParams.get("text")).toBe("Parque Lleras");
    expect(url.searchParams.get("bias")).toBe("proximity:-75.5674,6.2087");
    expect(url.searchParams.get("filter")).toBe(
      "circle:-75.5674,6.2087,150000",
    );
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("search without a position sends no bias", () => {
    const url = new URL(
      searchUrl({ text: "Lagos", near: null, lang: "en", apiKey: "k" }),
    );
    expect(url.searchParams.has("bias")).toBe(false);
    expect(url.searchParams.has("filter")).toBe(false);
  });

  it("route waypoints go latitude first, from then to", () => {
    const url = new URL(
      routeUrl({
        from: { lat: 6.2, lng: -75.57 },
        to: { lat: 6.25, lng: -75.56 },
        mode: "walk",
        lang: "es",
        apiKey: "k",
      }),
    );
    expect(url.pathname).toBe("/v1/routing");
    expect(url.searchParams.get("waypoints")).toBe("6.2,-75.57|6.25,-75.56");
    expect(url.searchParams.get("mode")).toBe("walk");
  });

  it("falls back to English for a language the provider does not write", () => {
    expect(navLang("es")).toBe("es");
    expect(navLang("es-CO")).toBe("es");
    expect(navLang("sw")).toBe("en");
    expect(navLang(null)).toBe("en");
  });
});

describe("parsePlaces", () => {
  it("keeps the name and the rest of the address", () => {
    const places = parsePlaces({
      results: [
        {
          address_line1: "Parque Lleras",
          address_line2: "El Poblado, Medellín, Colombia",
          lat: 6.2087,
          lon: -75.5674,
        },
      ],
    });
    expect(places).toEqual([
      {
        title: "Parque Lleras",
        detail: "El Poblado, Medellín, Colombia",
        lat: 6.2087,
        lng: -75.5674,
      },
    ]);
  });

  it("shows a place by its name when the first address line is only the city", () => {
    // What Geoapify really answered for "parque lleras".
    const places = parsePlaces({
      results: [
        {
          name: "Parque Lleras",
          result_type: "county",
          formatted: "Medellín, Colombia",
          address_line1: "Medellín",
          address_line2: "Colombia",
          lat: 6.20882,
          lon: -75.56761,
        },
      ],
    });
    expect(places).toEqual([
      {
        title: "Parque Lleras",
        detail: "Medellín, Colombia",
        lat: 6.20882,
        lng: -75.56761,
      },
    ]);
  });

  it("lists a place once when the provider returns it twice", () => {
    const places = parsePlaces({
      results: [
        {
          name: "Centro Comercial Santafé",
          address_line1: "Centro Comercial Santafé",
          address_line2: "El Poblado",
          lat: 6.1966,
          lon: -75.5741,
        },
        {
          name: "Centro Comercial Santafé",
          address_line1: "Centro Comercial Santafé",
          address_line2: "Carrera 42",
          lat: 6.1972,
          lon: -75.5745,
        },
        // Same name in another city is another place.
        {
          name: "Centro Comercial Santafé",
          address_line1: "Centro Comercial Santafé",
          address_line2: "Bogotá",
          lat: 4.7625,
          lon: -74.0457,
        },
      ],
    });
    expect(places.map((p) => p.detail)).toEqual(["El Poblado", "Bogotá"]);
  });

  it("drops rows with no usable position or name", () => {
    const places = parsePlaces({
      results: [
        { address_line1: "No position" },
        { lat: 1, lon: 2 },
        { address_line1: "Off the planet", lat: 120, lon: 2 },
        null,
        { formatted: "Only formatted", lat: 1, lon: 2 },
      ],
    });
    expect(places.map((p) => p.title)).toEqual(["Only formatted"]);
  });

  it("answers an empty list for anything that is not an answer", () => {
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces({ error: "Unauthorized" })).toEqual([]);
    expect(parsePlaces({ results: "nope" })).toEqual([]);
  });
});

describe("parseRoute", () => {
  const body = {
    features: [
      {
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [-75.57, 6.2],
              [-75.57, 6.201],
              [-75.569, 6.201],
            ],
          ],
        },
        properties: {
          distance: 221,
          time: 160,
          legs: [
            {
              steps: [
                {
                  from_index: 0,
                  to_index: 1,
                  distance: 111,
                  instruction: { text: "Head north" },
                },
                {
                  from_index: 1,
                  to_index: 2,
                  distance: 110,
                  instruction: { text: "Turn right" },
                },
                {
                  from_index: 2,
                  to_index: 2,
                  distance: 0,
                  instruction: { text: "You have arrived" },
                },
              ],
            },
          ],
        },
      },
    ],
  };

  it("reads the line, the totals and the turns", () => {
    const route = parseRoute(body);
    expect(route?.coords).toHaveLength(3);
    expect(route?.distanceM).toBe(221);
    expect(route?.durationS).toBe(160);
    expect(route?.steps.map((s) => [s.at, s.text])).toEqual([
      [0, "Head north"],
      [1, "Turn right"],
      [2, "You have arrived"],
    ]);
  });

  it("joins legs and shifts their step indexes", () => {
    const twoLegs = structuredClone(body);
    twoLegs.features[0].geometry.coordinates.push([
      [-75.569, 6.201],
      [-75.568, 6.201],
    ]);
    twoLegs.features[0].properties.legs.push({
      steps: [
        {
          from_index: 1,
          to_index: 1,
          distance: 0,
          instruction: { text: "Second leg end" },
        },
      ],
    });
    const route = parseRoute(twoLegs);
    expect(route?.coords).toHaveLength(5);
    expect(route?.steps.at(-1)).toMatchObject({
      at: 4,
      text: "Second leg end",
    });
  });

  it("answers null when there is no line to draw", () => {
    expect(parseRoute(null)).toBeNull();
    expect(parseRoute({ features: [] })).toBeNull();
    expect(parseRoute({ statusCode: 400, message: "No route" })).toBeNull();
    expect(
      parseRoute({
        features: [
          {
            geometry: { type: "MultiLineString", coordinates: [[[1, 2]]] },
            properties: {},
          },
        ],
      }),
    ).toBeNull();
  });
});
