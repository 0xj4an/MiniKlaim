"use client";

import { layoutMini } from "@/lib/map/territoryMiniLayout";

const W = 104;
const H = 84;

/** A hexagon with softened corners, pointy side up, as a path. */
function cell(cx: number, cy: number, r: number): string {
  const c = Math.min(r * 0.24, 1.6);
  const v: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (30 + 60 * i);
    v.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  let d = "";
  for (let i = 0; i < 6; i++) {
    const p = v[(i + 5) % 6];
    const n = v[(i + 1) % 6];
    const k = c / r;
    const ax = v[i][0] + (p[0] - v[i][0]) * k;
    const ay = v[i][1] + (p[1] - v[i][1]) * k;
    const bx = v[i][0] + (n[0] - v[i][0]) * k;
    const by = v[i][1] + (n[1] - v[i][1]) * k;
    d += `${i ? "L" : "M"}${ax.toFixed(1)} ${ay.toFixed(1)}Q${v[i][0].toFixed(1)} ${v[i][1].toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  return `${d}Z`;
}

/**
 * The player's land as a small picture: the place where they hold the most
 * blocks, north up, drawn from a few dozen points that arrive with their
 * stats (lib/map/territoryMini). No map library and no tiles, so it can sit
 * on the home screen of the slowest phone.
 *
 * With no blocks yet it shows the one thing there is to do: an empty block.
 */
export function TerritoryMini({
  cells,
  className,
}: {
  cells: ReadonlyArray<readonly [number, number]> | null | undefined;
  className?: string;
}) {
  const { points, radius } = layoutMini(cells ?? [], W, H);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      aria-hidden
      focusable="false"
    >
      {points.length === 0 ? (
        <path
          d={cell(W / 2, H / 2, 13)}
          fill="none"
          stroke="var(--color-zinc-400)"
          strokeWidth="1.4"
          strokeDasharray="3 3"
        />
      ) : (
        points.map(([x, y], i) => (
          <path
            key={i}
            d={cell(x, y, Math.max(1.2, radius - 0.5))}
            fill="var(--color-mine)"
            fillOpacity="0.55"
            stroke="var(--color-mine)"
            strokeWidth={radius > 3 ? 0.8 : 0.5}
          />
        ))
      )}
    </svg>
  );
}
