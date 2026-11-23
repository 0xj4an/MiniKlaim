import { cellToLatLng, cellToParent, getResolution } from "h3-js";

/**
 * A thumbnail of a player's territory, small enough to send with their stats
 * and draw without a map: the centers of at most `maxCells` hexagons, coarse
 * enough to cover the place where the player holds the most blocks.
 *
 * The home screen wanted to show the player their land, and loading the map
 * there to do it would put MapLibre and tiles on the first screen of the
 * slowest phones. A few dozen points cost nothing.
 *
 * Only the densest "city" (an H3 resolution-5 cell, the grouping the stats
 * already use) is drawn. A player with blocks in Lagos and in Medellin gets
 * the one where they hold more, at a scale where it has a shape, rather than
 * two dots an ocean apart.
 */
export type TerritoryMini = {
  /** [latitude, longitude] of each cell drawn, north-up. */
  cells: Array<[number, number]>;
  /** Blocks the thumbnail stands for. */
  blocks: number;
};

const CITY_RESOLUTION = 5;

export function territoryMini(
  h3Ids: readonly string[],
  maxCells = 72,
): TerritoryMini | null {
  if (h3Ids.length === 0) return null;

  // The city holding the most blocks.
  const byCity = new Map<string, string[]>();
  for (const id of h3Ids) {
    let city: string;
    try {
      city =
        getResolution(id) <= CITY_RESOLUTION
          ? id
          : cellToParent(id, CITY_RESOLUTION);
    } catch {
      continue;
    }
    const list = byCity.get(city);
    if (list) list.push(id);
    else byCity.set(city, [id]);
  }
  let home: string[] = [];
  for (const list of byCity.values()) if (list.length > home.length) home = list;
  if (home.length === 0) return null;

  // Coarsen one resolution at a time until it fits. Each pass works on the
  // previous pass's cells, so the cost falls off fast: 13,000 blocks become
  // a few thousand parents, then a few hundred.
  let cells = Array.from(new Set(home));
  let res = getResolution(cells[0]);
  while (cells.length > maxCells && res > CITY_RESOLUTION) {
    res -= 1;
    const parents = new Set<string>();
    for (const c of cells) parents.add(cellToParent(c, res));
    cells = Array.from(parents);
  }
  if (cells.length > maxCells) cells = cells.slice(0, maxCells);

  return {
    cells: cells.map((c) => {
      const [lat, lng] = cellToLatLng(c);
      return [round(lat), round(lng)];
    }),
    blocks: home.length,
  };
}

/** Five decimals is about a meter, far finer than a thumbnail can show. */
function round(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
