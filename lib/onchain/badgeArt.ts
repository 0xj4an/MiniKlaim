// Pure data: SVG art + ERC-1155 metadata for each badge id. No "use client",
// no React, no server-key imports. Safe to import from route handlers (to serve
// metadata/image) and from client components (to render the icon).

export type BadgeMeta = { name: string; description: string };

// Canonical English copy. Mirrors the badge.* keys in lib/i18nDict.ts; kept here
// so on-chain metadata is locale-independent.
export const BADGE_META: Record<number, BadgeMeta> = {
  1: { name: "First steps", description: "Finish your first run" },
  2: { name: "Five blocks", description: "Own 5 blocks" },
  3: { name: "Mayor", description: "Own 20 blocks" },
  4: { name: "Hundred", description: "Own 100 blocks" },
  5: { name: "Three days", description: "3 days in a row" },
  6: { name: "One week", description: "7 days in a row" },
  7: { name: "Two weeks", description: "14 days in a row" },
  8: { name: "Big run", description: "5 blocks in one run" },
  9: { name: "Marathon", description: "10 km in one run" },
  10: { name: "Iron", description: "Finish 50 runs" },
};

export const BADGE_IDS_WITH_ART = Object.keys(BADGE_META).map(Number);

/** Pointy-top hexagon path centered at (cx,cy) with circumradius r. */
function hex(cx: number, cy: number, r: number): string {
  const s = (r * Math.sqrt(3)) / 2;
  const h = r / 2;
  const p = [
    [cx, cy - r],
    [cx + s, cy - h],
    [cx + s, cy + h],
    [cx, cy + r],
    [cx - s, cy + h],
    [cx - s, cy - h],
  ];
  return `M${p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")} Z`;
}

function num(value: string, size: number, dy = 0): string {
  return `<text x="128" y="${146 + dy}" font-size="${size}" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif">${value}</text>`;
}

const FLAME = `<path d="M128 76 C112 104 104 118 104 142 a24 24 0 0 0 48 0 c0 -22 -10 -36 -24 -66 Z" fill="#fff"/>`;

// White glyph per badge, drawn in the 256x256 medallion space (center ~128,128).
const GLYPHS: Record<number, string> = {
  // First steps -> finish flag.
  1: `<g stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><line x1="102" y1="82" x2="102" y2="178"/></g><path d="M104 88 H166 L150 110 L166 132 H104 Z" fill="#fff"/>`,
  // Five blocks -> honeycomb of five hexes.
  2: `<g fill="#fff">${[
    [104, 104],
    [152, 104],
    [80, 146],
    [128, 146],
    [176, 146],
  ]
    .map(([x, y]) => `<path d="${hex(x, y, 22)}"/>`)
    .join("")}</g>`,
  // Mayor -> crown.
  3: `<path d="M92 162 L84 100 L112 126 L128 92 L144 126 L172 100 L164 162 Z" fill="#fff"/><rect x="92" y="162" width="72" height="16" rx="3" fill="#fff"/>`,
  // Hundred -> 100.
  4: num("100", 56),
  // Streaks -> flame with the day count.
  5: `${FLAME}<text x="128" y="156" font-size="34" font-weight="800" text-anchor="middle" fill="#ea580c" font-family="Arial, Helvetica, sans-serif">3</text>`,
  6: `${FLAME}<text x="128" y="156" font-size="34" font-weight="800" text-anchor="middle" fill="#ea580c" font-family="Arial, Helvetica, sans-serif">7</text>`,
  7: `${FLAME}<text x="128" y="154" font-size="28" font-weight="800" text-anchor="middle" fill="#ea580c" font-family="Arial, Helvetica, sans-serif">14</text>`,
  // Big run -> lightning bolt.
  8: `<path d="M142 74 L100 142 H124 L114 182 L160 110 H134 Z" fill="#fff"/>`,
  // Marathon -> 10K.
  9: num("10K", 46),
  // Iron -> shield with run count.
  10: `<path d="M128 78 L170 94 V134 C170 164 151 181 128 190 C105 181 86 164 86 134 V94 Z" fill="#fff"/><text x="128" y="146" font-size="34" font-weight="800" text-anchor="middle" fill="#ea580c" font-family="Arial, Helvetica, sans-serif">50</text>`,
};

/** Full standalone SVG for a badge id (the on-chain image, also rendered inline
 *  in the UI). viewBox is fixed at 256; `size` sets the rendered width/height. */
export function badgeSvg(id: number, size = 256): string {
  const glyph = GLYPHS[id] ?? "";
  const gid = `mkb-g${id}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256" role="img">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fb923c"/>
      <stop offset="1" stop-color="#ea580c"/>
    </linearGradient>
  </defs>
  <path d="${hex(128, 128, 112)}" fill="url(#${gid})" stroke="#9a3412" stroke-width="6" stroke-linejoin="round"/>
  <path d="${hex(128, 128, 90)}" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="3"/>
  ${glyph}
</svg>`;
}
