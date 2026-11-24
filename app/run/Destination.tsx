"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as maplibregl from "maplibre-gl";
import { CloseButton } from "@/app/CloseButton";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import {
  cumulativeMeters,
  formatNavDistance,
  formatNavMinutes,
  navProgress,
  OFF_ROUTE_METERS,
  type NavProgress,
} from "@/lib/nav/progress";
import type { NavMode, NavPlace, NavRoute } from "@/lib/nav/types";
import type { MoveMode } from "@/lib/runs/moveMode";

/**
 * Optional directions on the run screen.
 *
 * The player picks a place, the way there is drawn on the same map and a
 * banner names the next turn, so nobody has to leave for another maps app
 * and lose the run. It only draws and reads the position: capturing blocks
 * is untouched and works exactly as on a run with no destination.
 *
 * Kept apart from the run page on purpose. It reads the position and the map
 * through getters and owns its own map source, so the run's GPS pipeline has
 * no new branch in it.
 */

const SOURCE = "nav-route";
const CASING = "nav-route-casing";
const LINE = "nav-route-line";

const SEARCH_DEBOUNCE_MS = 700;
const MIN_CHARS = 3;
const TICK_MS = 1500;
/** Fixes in a row off the line before asking for a new way. */
const OFF_ROUTE_TICKS = 4;
const REROUTE_GAP_MS = 20_000;
/** A new way costs a credit of a small daily budget. */
const MAX_REROUTES = 6;
const ARRIVED_SHOWN_MS = 8_000;

const MODES: NavMode[] = ["walk", "bicycle", "drive"];

function modeFor(move: MoveMode | null): NavMode {
  if (move === "bike") return "bicycle";
  if (move === "car" || move === "moto" || move === "bus") return "drive";
  return "walk";
}

type Phase =
  | { kind: "idle" }
  | { kind: "picking" }
  | { kind: "active"; place: NavPlace; route: NavRoute }
  | { kind: "arrived"; place: NavPlace };

type Problem =
  "needLocation" | "failed" | "noRoute" | "tooFar" | "unavailable" | null;

function problemFrom(code: unknown): Exclude<Problem, null | "needLocation"> {
  if (code === "nav_no_route") return "noRoute";
  if (code === "nav_too_far") return "tooFar";
  if (code === "nav_unavailable") return "unavailable";
  return "failed";
}

function emptyLine(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function lineOf(route: NavRoute): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: route.coords },
      },
    ],
  };
}

/**
 * Put the line on the map, creating its source and layers when they are not
 * there. The map can be rebuilt under a run (a lost GPU context, a retry),
 * so this is called on every tick rather than once.
 */
function drawRoute(map: maplibregl.Map | null, route: NavRoute | null) {
  if (!map) return;
  try {
    const source = map.getSource(SOURCE) as
      maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(route ? lineOf(route) : emptyLine());
      return;
    }
    if (!route || !map.isStyleLoaded()) return;
    map.addSource(SOURCE, { type: "geojson", data: lineOf(route) });
    // Under the player's dot, over the blocks: the way is read at a glance
    // and never hides where the player is.
    const before = map.getLayer("position-circle")
      ? "position-circle"
      : undefined;
    map.addLayer(
      {
        id: CASING,
        type: "line",
        source: SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#FFFFFF",
          "line-width": 8,
          "line-opacity": 0.9,
        },
      },
      before,
    );
    map.addLayer(
      {
        id: LINE,
        type: "line",
        source: SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        // Blue: no block on the map is blue, so the way is never mistaken
        // for territory.
        paint: { "line-color": "#2563EB", "line-width": 5 },
      },
      before,
    );
  } catch {
    // The style is mid-swap. The next tick draws it.
  }
}

export function Destination({
  getPosition,
  getMap,
  moveMode,
  inRun,
}: {
  getPosition: () => { lat: number; lng: number } | null;
  getMap: () => maplibregl.Map | null;
  moveMode: MoveMode | null;
  inRun: boolean;
}) {
  const { t, locale } = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<NavPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [routing, setRouting] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [mode, setMode] = useState<NavMode>(() => modeFor(moveMode));
  const [progress, setProgress] = useState<NavProgress | null>(null);

  const modeTouchedRef = useRef(false);
  const reroutesRef = useRef(0);
  const inRunRef = useRef(inRun);
  inRunRef.current = inRun;

  // Offered only when the server has a key and budget left for today.
  useEffect(() => {
    let alive = true;
    fetch("/api/nav/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { enabled?: boolean } | null) => {
        if (alive && body?.enabled) setEnabled(true);
      })
      .catch(() => {
        // No directions today. The run screen works as always.
      });
    return () => {
      alive = false;
    };
  }, []);

  // Follow the way of moving the player declared for the run, until they
  // pick one here themselves.
  useEffect(() => {
    if (!modeTouchedRef.current) setMode(modeFor(moveMode));
  }, [moveMode]);

  // Search as the player types, but only after a pause: each request costs.
  useEffect(() => {
    if (phase.kind !== "picking") return;
    const text = query.trim();
    if (text.length < MIN_CHARS) {
      setPlaces(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: text, lang: locale });
      const pos = getPosition();
      if (pos) params.set("near", `${pos.lat},${pos.lng}`);
      fetch(`/api/nav/search?${params}`, { signal: controller.signal })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as {
            places?: NavPlace[];
            error?: string;
          };
          if (!res.ok) {
            setProblem(problemFrom(body.error));
            setPlaces(null);
            return;
          }
          setProblem(null);
          setPlaces(body.places ?? []);
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name === "AbortError") return;
          setProblem("failed");
          setPlaces(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, phase.kind, locale, getPosition]);

  const fetchRoute = useCallback(
    async (
      place: NavPlace,
      how: NavMode,
    ): Promise<NavRoute | Exclude<Problem, null>> => {
      const pos = getPosition();
      if (!pos) return "needLocation";
      const params = new URLSearchParams({
        from: `${pos.lat},${pos.lng}`,
        to: `${place.lat},${place.lng}`,
        mode: how,
        lang: locale,
      });
      try {
        const res = await fetch(`/api/nav/route?${params}`);
        const body = (await res.json().catch(() => ({}))) as {
          route?: NavRoute;
          error?: string;
        };
        if (!res.ok || !body.route) return problemFrom(body.error);
        return body.route;
      } catch {
        return "failed";
      }
    },
    [getPosition, locale],
  );

  const choose = async (place: NavPlace) => {
    if (routing) return;
    setRouting(true);
    setProblem(null);
    const got = await fetchRoute(place, mode);
    setRouting(false);
    if (typeof got === "string") {
      setProblem(got);
      return;
    }
    reroutesRef.current = 0;
    setProgress(null);
    setPhase({ kind: "active", place, route: got });
    track("nav_route_started", {
      mode,
      distance_m: Math.round(got.distanceM),
      in_run: inRunRef.current,
    });
  };

  const end = useCallback(
    (reason: "arrived" | "cancelled") => {
      drawRoute(getMap(), null);
      track("nav_route_ended", { reason, reroutes: reroutesRef.current });
      setProgress(null);
      setRerouting(false);
    },
    [getMap],
  );

  // While a route is active: keep the line on the map, work out the next
  // turn, notice arriving and ask for a new way when the player leaves it.
  useEffect(() => {
    if (phase.kind !== "active") return;
    const { route, place } = phase;
    const cumulative = cumulativeMeters(route.coords);
    let offTicks = 0;
    let lastReroute = 0;
    let busy = false;
    let alive = true;

    const tick = () => {
      drawRoute(getMap(), route);
      const pos = getPosition();
      if (!pos) return;
      const now = navProgress(route, cumulative, pos);
      setProgress(now);

      if (now.arrived) {
        end("arrived");
        setPhase({ kind: "arrived", place });
        return;
      }

      offTicks = now.offRouteM > OFF_ROUTE_METERS ? offTicks + 1 : 0;
      if (
        offTicks >= OFF_ROUTE_TICKS &&
        !busy &&
        reroutesRef.current < MAX_REROUTES &&
        Date.now() - lastReroute > REROUTE_GAP_MS
      ) {
        busy = true;
        lastReroute = Date.now();
        reroutesRef.current += 1;
        setRerouting(true);
        void fetchRoute(place, mode).then((got) => {
          busy = false;
          if (!alive) return;
          setRerouting(false);
          // A failed reroute keeps the old line: a way that is a street off
          // is still more use than no way at all.
          if (typeof got !== "string")
            setPhase({ kind: "active", place, route: got });
        });
      }
    };

    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [phase, getMap, getPosition, fetchRoute, mode, end]);

  // "You arrived" clears itself.
  useEffect(() => {
    if (phase.kind !== "arrived") return;
    const timer = window.setTimeout(
      () => setPhase({ kind: "idle" }),
      ARRIVED_SHOWN_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Leaving the screen takes the line with it.
  useEffect(() => () => drawRoute(getMap(), null), [getMap]);

  if (!enabled) return null;

  // In a run the challenge chip sits at the top right, so the banner goes
  // under it. Outside a run it takes the strip the search pill just left,
  // which keeps it clear of the legend button on a short screen.
  const bannerTop = inRun ? "top-[6.5rem]" : "top-[3.5rem]";

  const openPicker = () => {
    setProblem(null);
    setPlaces(null);
    setQuery("");
    setPhase({ kind: "picking" });
  };

  const problemText =
    problem === "needLocation"
      ? t("run.nav.needLocation")
      : problem === "noRoute"
        ? t("run.nav.noRoute")
        : problem === "tooFar"
          ? t("run.nav.tooFar")
          : problem === "unavailable"
            ? t("run.nav.unavailable")
            : problem === "failed"
              ? t("run.nav.failed")
              : null;

  return (
    <>
      {phase.kind === "idle" && (
        // A search pill under the Back button, where a maps app has it. One
        // layer under the GPS and alert banners (z-10 and up), which share
        // this strip and matter more than an optional extra.
        <button
          type="button"
          onClick={openPicker}
          aria-label={t("run.nav.open")}
          className="absolute top-[3.5rem] left-4 z-[9] flex h-10 max-w-[calc(100%-13rem)] items-center gap-2 rounded-full bg-white/95 pr-4 pl-3 text-sm font-medium text-zinc-700 shadow-md backdrop-blur hover:bg-white"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-blue-700"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <span className="truncate">{t("run.nav.title")}</span>
        </button>
      )}

      {phase.kind === "active" && (
        <div
          role="status"
          className={`absolute inset-x-4 z-10 rounded-md bg-white/95 px-3 py-2 shadow-md backdrop-blur ${bannerTop}`}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm leading-snug font-semibold text-zinc-900">
                {rerouting
                  ? t("run.nav.rerouting")
                  : progress?.nextStep
                    ? `${t("run.nav.in").replace(
                        "{distance}",
                        formatNavDistance(progress.toNextStepM),
                      )}: ${progress.nextStep.text}`
                    : t("run.nav.start")}
              </p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <p className="min-w-0 flex-1 truncate text-xs text-zinc-600">
                  {phase.place.title}
                  {progress
                    ? ` - ${t("run.nav.left")
                        .replace(
                          "{distance}",
                          formatNavDistance(progress.remainingM),
                        )
                        .replace(
                          "{minutes}",
                          String(
                            formatNavMinutes(
                              phase.route.distanceM > 0
                                ? (phase.route.durationS *
                                    progress.remainingM) /
                                    phase.route.distanceM
                                : phase.route.durationS,
                            ),
                          ),
                        )}`
                    : ""}
                </p>
                {/* The provider's name, as its free plan asks. The full line
                    is on the search sheet; here every pixel is the route. */}
                <span className="shrink-0 text-[10px] text-zinc-500">
                  Geoapify
                </span>
              </div>
            </div>
            <CloseButton
              label={t("run.nav.end")}
              onClick={() => {
                end("cancelled");
                setPhase({ kind: "idle" });
              }}
            />
          </div>
        </div>
      )}

      {phase.kind === "arrived" && (
        <div
          role="status"
          className={`absolute inset-x-4 z-10 flex items-center gap-2 rounded-md bg-white/95 px-3 py-2 shadow-md backdrop-blur ${bannerTop}`}
        >
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
            {t("run.nav.arrived")}: {phase.place.title}
          </p>
          <CloseButton
            label={t("campaign.close")}
            onClick={() => setPhase({ kind: "idle" })}
          />
        </div>
      )}

      {phase.kind === "picking" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="nav-title"
          className="absolute inset-0 z-40 flex flex-col bg-black/40"
        >
          <div
            className="mx-auto flex max-h-full w-full max-w-md flex-col gap-3 rounded-b-2xl bg-white p-4 shadow-xl"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2
                  id="nav-title"
                  className="text-base font-bold text-zinc-900"
                >
                  {t("run.nav.title")}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-600">
                  {t("run.nav.hint")}
                </p>
              </div>
              <CloseButton
                label={t("campaign.close")}
                onClick={() => setPhase({ kind: "idle" })}
              />
            </div>

            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoFocus
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("run.nav.placeholder")}
              aria-label={t("run.nav.placeholder")}
              maxLength={80}
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-blue-600"
            />

            <div
              className="flex gap-2"
              role="group"
              aria-label={t("run.nav.title")}
            >
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => {
                    modeTouchedRef.current = true;
                    setMode(m);
                  }}
                  className={`h-9 flex-1 rounded-full border text-xs font-semibold ${
                    mode === m
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-700"
                  }`}
                >
                  {t(`run.nav.mode.${m}`)}
                </button>
              ))}
            </div>

            <div className="min-h-[3rem] overflow-y-auto" aria-live="polite">
              {routing ? (
                <p className="py-3 text-sm text-zinc-600">
                  {t("run.nav.routing")}
                </p>
              ) : problemText ? (
                <p role="alert" className="py-3 text-sm text-red-700">
                  {problemText}
                </p>
              ) : searching ? (
                <p className="py-3 text-sm text-zinc-600">
                  {t("run.nav.searching")}
                </p>
              ) : places === null ? (
                <p className="py-3 text-sm text-zinc-500">
                  {t("run.nav.typeMore")}
                </p>
              ) : places.length === 0 ? (
                <p className="py-3 text-sm text-zinc-600">
                  {t("run.nav.noResults")}
                </p>
              ) : null}
              {!routing && places && places.length > 0 && (
                <ul className="divide-y divide-zinc-200">
                  {places.map((place) => (
                    <li key={`${place.lat},${place.lng},${place.title}`}>
                      <button
                        type="button"
                        onClick={() => void choose(place)}
                        className="flex min-h-[48px] w-full flex-col justify-center py-2 text-left"
                      >
                        <span className="truncate text-sm font-semibold text-zinc-900">
                          {place.title}
                        </span>
                        {place.detail && (
                          <span className="truncate text-xs text-zinc-600">
                            {place.detail}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-[10px] text-zinc-500">
              {t("run.nav.attribution")}
            </p>
          </div>
          {/* Tapping the map behind the sheet closes it. */}
          <button
            type="button"
            aria-label={t("campaign.close")}
            className="flex-1"
            onClick={() => setPhase({ kind: "idle" })}
          />
        </div>
      )}
    </>
  );
}
