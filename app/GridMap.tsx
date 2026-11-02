"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createLogger } from "@/lib/logger";
import { drawGrid } from "@/lib/map/gridDraw";
import { getGridData, subscribeGrid, type GridData } from "@/lib/map/gridStore";
import { mapRenderFailed, mapRenderReady, mapRenderStarted } from "@/lib/map/mapTelemetry";

const log = createLogger("gridmap");

type Props = {
  /** Which surface this is, for the telemetry that watches the tier. */
  path: string;
  className?: string;
};

/**
 * The map for the `grid` tier: a 2D canvas, no GPU and no tiles.
 *
 * Data comes from the grid store rather than from props, so a position fix
 * repaints the canvas without re-rendering the page that produced it. These
 * are the slowest phones in the population and a run pushes a fix a second.
 *
 * Painting is coalesced onto an animation frame, so a burst of fixes costs
 * one repaint, and the canvas is built once: new data must never tear it down
 * and probe the context again.
 */
export default function GridMap({ path, className }: Props) {
  const data = useSyncExternalStore(subscribeGrid, getGridData, () => getGridData());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const dataRef = useRef<GridData>(data);
  const reportedRef = useRef(false);
  const scheduleRef = useRef<(() => void) | null>(null);

  dataRef.current = data;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    mapRenderStarted("grid", "grid", path);
    const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch (e) {
      mapRenderFailed("grid", "grid", path, "construct", e);
      return;
    }
    if (!ctx) {
      // No 2D context either. There is no tier below this one, so the player
      // keeps the numbers and we need to know that it happened at all.
      mapRenderFailed("grid", "grid", path, "construct", new Error("no 2d context"));
      return;
    }
    const context = ctx;

    const theme =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? ("dark" as const)
        : ("light" as const);

    const paint = () => {
      frameRef.current = null;
      const parent = canvas.parentElement;
      const width = Math.max(1, Math.round(parent?.clientWidth || canvas.clientWidth || 1));
      const height = Math.max(1, Math.round(parent?.clientHeight || canvas.clientHeight || 1));
      // Cap the backing store at 2x: filling a 3x buffer in software on a
      // phone with no GPU costs real time for no visible gain.
      const ratio = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
      const backingW = Math.round(width * ratio);
      const backingH = Math.round(height * ratio);

      if (canvas.width !== backingW || canvas.height !== backingH) {
        canvas.width = backingW;
        canvas.height = backingH;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      try {
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        const drawn = drawGrid(context, {
          ...dataRef.current,
          size: { width, height },
          theme,
        });
        if (!reportedRef.current) {
          reportedRef.current = true;
          const now = typeof performance === "undefined" ? Date.now() : performance.now();
          mapRenderReady("grid", "grid", path, now - startedAt);
          log.info("grid map drawn", { drawn, width, height, ratio });
        }
      } catch (e) {
        // One bad frame must not take the run down, and the next fix will
        // schedule another.
        mapRenderFailed("grid", "grid", path, "draw", e);
      }
    };

    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame(paint)
          : (setTimeout(paint, 16) as unknown as number);
    };

    scheduleRef.current = schedule;
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      scheduleRef.current = null;
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (frameRef.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
    };
  }, [path]);

  // New blocks or a new fix: repaint on the same canvas and context.
  useEffect(() => {
    scheduleRef.current?.();
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      // Decorative to a screen reader: the run's numbers are text below it,
      // and that is what a reader should reach.
      aria-hidden="true"
    />
  );
}
