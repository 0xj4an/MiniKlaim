// Pure data: SVG art + ERC-1155 metadata for each badge id. No "use client",
// no React, no server-key imports. Safe to import from route handlers (to serve
// metadata/image) and from client components (to render the icon).
//
// Ids are grouped contiguously by category (see lib/onchain/badges.ts):
// territory 1-8, runs 9-14, single-run 15-18, distance 19-24, streaks 25-27,
// cities 28-32, conquest 33-37, countries 38-43.

export type BadgeMeta = { name: string; description: string };

// Canonical English copy. Mirrors the badge ids in lib/onchain/badges.ts; kept
// here so on-chain metadata is locale-independent.
export const BADGE_META: Record<number, BadgeMeta> = {
  1: { name: "Five blocks", description: "Own 5 blocks" },
  2: { name: "Mayor", description: "Own 20 blocks" },
  3: { name: "Hundred", description: "Own 100 blocks" },
  4: { name: "Baron", description: "Own 250 blocks" },
  5: { name: "Duke", description: "Own 500 blocks" },
  6: { name: "Kingdom", description: "Own 1000 blocks" },
  7: { name: "Empire", description: "Own 2,500 blocks" },
  8: { name: "Dominion", description: "Own 10,000 blocks" },
  9: { name: "First steps", description: "Finish your first run" },
  10: { name: "Iron", description: "Finish 50 runs" },
  11: { name: "Veteran", description: "Finish 100 runs" },
  12: { name: "Relentless", description: "Finish 250 runs" },
  13: { name: "Machine", description: "Finish 500 runs" },
  14: { name: "Legend", description: "Finish 1,000 runs" },
  15: { name: "Big run", description: "5 blocks in one run" },
  16: { name: "Marathon", description: "10 km in one run" },
  17: { name: "Half marathon", description: "21 km in one run" },
  18: { name: "Full marathon", description: "42 km in one run" },
  19: { name: "Pacer", description: "Run 50 km total" },
  20: { name: "Roadrunner", description: "Run 100 km total" },
  21: { name: "Ultra", description: "Run 500 km total" },
  22: { name: "Iron legs", description: "Run 1,000 km total" },
  23: { name: "Earthstrider", description: "Run 5,000 km total" },
  24: { name: "Equator", description: "Run 40,000 km total (around the world)" },
  25: { name: "Three days", description: "3 days in a row" },
  26: { name: "One week", description: "7 days in a row" },
  27: { name: "Two weeks", description: "14 days in a row" },
  28: { name: "Explorer", description: "Own blocks in 3 cities" },
  29: { name: "Wanderer", description: "Own blocks in 10 cities" },
  30: { name: "Pioneer", description: "Own blocks in 25 cities" },
  31: { name: "Cartographer", description: "Own blocks in 50 cities" },
  32: { name: "Atlas", description: "Own blocks in 100 cities" },
  33: { name: "First blood", description: "Capture 1 block from a rival" },
  34: { name: "Raider", description: "Capture 25 blocks from rivals" },
  35: { name: "Warlord", description: "Capture 100 blocks from rivals" },
  36: { name: "Conqueror", description: "Capture 500 blocks from rivals" },
  37: { name: "Overlord", description: "Capture 1,000 blocks from rivals" },
  38: { name: "Border crosser", description: "Own blocks in 2 countries" },
  39: { name: "Globetrotter", description: "Own blocks in 5 countries" },
  40: { name: "World citizen", description: "Own blocks in 10 countries" },
  41: { name: "Continental", description: "Own blocks in 25 countries" },
  42: { name: "Planetary", description: "Own blocks in 50 countries" },
  43: { name: "Hemispheric", description: "Own blocks in 100 countries" },
  44: { name: "Worldwide", description: "Own blocks in 195 countries (all of them)" },
};

/** Spanish copy, parallel to BADGE_META. Single source for localized display. */
export const BADGE_META_ES: Record<number, BadgeMeta> = {
  1: { name: "Cinco bloques", description: "Posee 5 bloques" },
  2: { name: "Alcalde", description: "Posee 20 bloques" },
  3: { name: "Centena", description: "Posee 100 bloques" },
  4: { name: "Baron", description: "Posee 250 bloques" },
  5: { name: "Duque", description: "Posee 500 bloques" },
  6: { name: "Reino", description: "Posee 1000 bloques" },
  7: { name: "Imperio", description: "Posee 2,500 bloques" },
  8: { name: "Dominio", description: "Posee 10,000 bloques" },
  9: { name: "Primeros pasos", description: "Termina tu primera corrida" },
  10: { name: "Hierro", description: "Termina 50 corridas" },
  11: { name: "Veterano", description: "Termina 100 corridas" },
  12: { name: "Implacable", description: "Termina 250 corridas" },
  13: { name: "Maquina", description: "Termina 500 corridas" },
  14: { name: "Leyenda", description: "Termina 1,000 corridas" },
  15: { name: "Gran corrida", description: "5 bloques en una corrida" },
  16: { name: "Maraton", description: "10 km en una corrida" },
  17: { name: "Media maraton", description: "21 km en una corrida" },
  18: { name: "Maraton completa", description: "42 km en una corrida" },
  19: { name: "Marcapaso", description: "Corre 50 km en total" },
  20: { name: "Corredor", description: "Corre 100 km en total" },
  21: { name: "Ultra", description: "Corre 500 km en total" },
  22: { name: "Piernas de hierro", description: "Corre 1,000 km en total" },
  23: { name: "Caminante terrestre", description: "Corre 5,000 km en total" },
  24: { name: "Ecuador", description: "Corre 40,000 km (la vuelta al mundo)" },
  25: { name: "Tres dias", description: "3 dias seguidos" },
  26: { name: "Una semana", description: "7 dias seguidos" },
  27: { name: "Dos semanas", description: "14 dias seguidos" },
  28: { name: "Explorador", description: "Bloques en 3 ciudades" },
  29: { name: "Trotamundos", description: "Bloques en 10 ciudades" },
  30: { name: "Pionero", description: "Bloques en 25 ciudades" },
  31: { name: "Cartografo", description: "Bloques en 50 ciudades" },
  32: { name: "Atlas", description: "Bloques en 100 ciudades" },
  33: { name: "Primera sangre", description: "Captura 1 bloque a un rival" },
  34: { name: "Saqueador", description: "Captura 25 bloques a rivales" },
  35: { name: "Senor de la guerra", description: "Captura 100 bloques a rivales" },
  36: { name: "Conquistador", description: "Captura 500 bloques a rivales" },
  37: { name: "Senor supremo", description: "Captura 1,000 bloques a rivales" },
  38: { name: "Cruzafronteras", description: "Bloques en 2 paises" },
  39: { name: "Trotaglobos", description: "Bloques en 5 paises" },
  40: { name: "Ciudadano del mundo", description: "Bloques en 10 paises" },
  41: { name: "Continental", description: "Bloques en 25 paises" },
  42: { name: "Planetario", description: "Bloques en 50 paises" },
  43: { name: "Hemisferico", description: "Bloques en 100 paises" },
  44: { name: "Mundial", description: "Bloques en 195 paises (todos)" },
};

export const BADGE_IDS_WITH_ART = Object.keys(BADGE_META).map(Number);

/** Localized name + description for a badge id. */
export function badgeCopy(id: number, locale: "en" | "es"): BadgeMeta {
  const meta =
    (locale === "es" ? BADGE_META_ES[id] : BADGE_META[id]) ?? BADGE_META[id];
  return meta ?? { name: `Badge #${id}`, description: "" };
}

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

function num(value: string, size: number): string {
  return `<text x="128" y="146" font-size="${size}" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif">${value}</text>`;
}

// Two-line km figure (same family as Marathon "10K"), for single-run distances.
function kmFigure(value: string): string {
  return `<text x="128" y="126" font-size="50" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif">${value}</text><text x="128" y="158" font-size="22" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif">KM</text>`;
}

function flameNum(value: string, size = 34, dy = 156): string {
  return `${FLAME}<text x="128" y="${dy}" font-size="${size}" font-weight="800" text-anchor="middle" fill="#ea580c" font-family="Arial, Helvetica, sans-serif">${value}</text>`;
}

const FLAME = `<path d="M128 76 C112 104 104 118 104 142 a24 24 0 0 0 48 0 c0 -22 -10 -36 -24 -66 Z" fill="#fff"/>`;

// Tiered badges: a small white motif up top + a number below.
function motifNum(motif: string, value: string, size = 30): string {
  return `${motif}<text x="128" y="180" font-size="${size}" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif">${value}</text>`;
}

const M_CROWN = `<path d="M104 110 L99 74 L116 92 L128 70 L140 92 L157 74 L152 110 Z" fill="#fff"/><rect x="104" y="110" width="48" height="10" rx="2" fill="#fff"/>`;
const M_ROAD = `<path d="M114 72 L102 116 M142 72 L154 116" stroke="#fff" stroke-width="9" stroke-linecap="round" fill="none"/><line x1="128" y1="74" x2="128" y2="114" stroke="#fff" stroke-width="6" stroke-dasharray="7 9" stroke-linecap="round"/>`;
const M_PIN = `<path d="M128 64 a24 24 0 0 1 24 24 c0 17 -24 40 -24 40 c0 0 -24 -23 -24 -40 a24 24 0 0 1 24 -24 Z" fill="#fff"/><circle cx="128" cy="88" r="8.5" fill="#ea580c"/>`;
const M_FLAG = `<line x1="108" y1="66" x2="108" y2="120" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M110 70 H156 L144 86 L156 102 H110 Z" fill="#fff"/>`;
const M_SWORDS = `<g stroke="#fff" stroke-width="8" stroke-linecap="round"><line x1="103" y1="70" x2="150" y2="118"/><line x1="153" y1="70" x2="106" y2="118"/></g><circle cx="103" cy="70" r="6" fill="#fff"/><circle cx="153" cy="70" r="6" fill="#fff"/>`;
const M_GLOBE = `<circle cx="128" cy="90" r="27" fill="none" stroke="#fff" stroke-width="6"/><ellipse cx="128" cy="90" rx="11" ry="27" fill="none" stroke="#fff" stroke-width="5"/><line x1="101" y1="90" x2="155" y2="90" stroke="#fff" stroke-width="5"/>`;

// White glyph per badge id, drawn in the 256x256 medallion space (center ~128,128).
const GLYPHS: Record<number, string> = {
  // Territory.
  1: `<g fill="#fff">${[
    [104, 104],
    [152, 104],
    [80, 146],
    [128, 146],
    [176, 146],
  ]
    .map(([x, y]) => `<path d="${hex(x, y, 22)}"/>`)
    .join("")}</g>`,
  2: `<path d="M92 162 L84 100 L112 128 L128 96 L144 128 L168 100 L160 162 Z" fill="#fff"/><rect x="92" y="162" width="72" height="16" rx="3" fill="#fff"/>`,
  3: num("100", 56),
  4: motifNum(M_CROWN, "250", 28),
  5: motifNum(M_CROWN, "500", 28),
  6: motifNum(M_CROWN, "1K", 32),
  7: motifNum(M_CROWN, "2.5K", 26),
  8: motifNum(M_CROWN, "10K", 30),
  // Runs.
  9: `<g stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><line x1="102" y1="82" x2="102" y2="178"/></g><path d="M104 88 H166 L150 110 L166 132 H104 Z" fill="#fff"/>`,
  10: `<path d="M128 78 L170 94 V134 C170 164 151 181 128 190 C105 181 86 164 86 134 V94 Z" fill="#fff"/><text x="128" y="146" font-size="34" font-weight="800" text-anchor="middle" fill="#ea580c" font-family="Arial, Helvetica, sans-serif">50</text>`,
  11: motifNum(M_FLAG, "100", 28),
  12: motifNum(M_FLAG, "250", 28),
  13: motifNum(M_FLAG, "500", 28),
  14: motifNum(M_FLAG, "1K", 30),
  // Single-run feats.
  15: `<path d="M142 74 L100 142 H124 L114 182 L160 110 H134 Z" fill="#fff"/>`,
  16: num("10K", 46),
  17: kmFigure("21"),
  18: kmFigure("42"),
  // Lifetime distance.
  19: motifNum(M_ROAD, "50"),
  20: motifNum(M_ROAD, "100", 28),
  21: motifNum(M_ROAD, "500", 28),
  22: motifNum(M_ROAD, "1K", 30),
  23: motifNum(M_ROAD, "5K", 30),
  24: motifNum(M_ROAD, "40K", 28),
  // Streaks.
  25: flameNum("3"),
  26: flameNum("7"),
  27: flameNum("14", 28, 154),
  // Cities.
  28: motifNum(M_PIN, "3"),
  29: motifNum(M_PIN, "10"),
  30: motifNum(M_PIN, "25"),
  31: motifNum(M_PIN, "50"),
  32: motifNum(M_PIN, "100", 28),
  // Conquest.
  33: motifNum(M_SWORDS, "1"),
  34: motifNum(M_SWORDS, "25"),
  35: motifNum(M_SWORDS, "100", 28),
  36: motifNum(M_SWORDS, "500", 28),
  37: motifNum(M_SWORDS, "1K", 30),
  // Countries.
  38: motifNum(M_GLOBE, "2"),
  39: motifNum(M_GLOBE, "5"),
  40: motifNum(M_GLOBE, "10"),
  41: motifNum(M_GLOBE, "25"),
  42: motifNum(M_GLOBE, "50"),
  43: motifNum(M_GLOBE, "100", 28),
  44: motifNum(M_GLOBE, "195", 28),
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
