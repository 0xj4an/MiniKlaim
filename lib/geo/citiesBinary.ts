/**
 * The city table as typed arrays instead of 135,233 JavaScript objects.
 *
 * `public/data/cities.json` held one object per city. Parsing it cost ~46 MB
 * of heap and `cityForHex` built a Map of per-country arrays on top, for
 * ~55 MB resident — inside a container that was capped at 512 MB, which is
 * what put MiniKlaim in a crashloop on 29 Oct 2026. Raising the cap to 8 GB
 * stopped the bleeding; this is the actual fix, and it keeps every city
 * rather than trimming the list down to the "top 5000" the old loader's
 * comment claimed it was already using.
 *
 * Numbers live in typed arrays and names in one UTF-8 blob, so the whole
 * table is a handful of allocations instead of hundreds of thousands. Cities
 * are sorted by country, so the cities of one country are a contiguous range
 * and the lookup needs no index built at runtime.
 *
 * Layout, little-endian, every section 4-byte aligned:
 *
 *   magic "MKC1"            4
 *   cityCount               u32
 *   countryCount            u32
 *   nameBytes               u32
 *   lat                     f32 × cityCount
 *   lon                     f32 × cityCount
 *   population              u32 × cityCount
 *   nameOffset              u32 × (cityCount + 1)   // into the names blob
 *   countryStart            u32 × (countryCount + 1) // ranges into the above
 *   countryCodes            2 bytes each, padded to 4
 *   names                   UTF-8, nameBytes
 */
export const CITIES_MAGIC = "MKC1";
const HEADER_BYTES = 16;

export type CityInput = {
  name: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  lat: number;
  lon: number;
  population: number;
};

export type CityTable = {
  cityCount: number;
  lat: Float32Array;
  lon: Float32Array;
  population: Uint32Array;
  /** Byte range of each name in `names`; length is cityCount + 1. */
  nameOffset: Uint32Array;
  names: Uint8Array;
  /** ISO2 codes, sorted, one per country. */
  countryCodes: string[];
  /** Range of each country in the city arrays; length is countryCount + 1. */
  countryStart: Uint32Array;
};

const align4 = (n: number) => (n + 3) & ~3;

export function encodeCities(input: readonly CityInput[]): Uint8Array {
  // Sorting by country is what makes a country's cities a contiguous range.
  // Population descending within a country only makes the natural tie-break
  // (bigger city wins an exact distance tie) fall out of the scan order.
  const cities = [...input].sort(
    (a, b) =>
      a.country.localeCompare(b.country) || b.population - a.population,
  );

  const enc = new TextEncoder();
  const nameBytes = cities.map((c) => enc.encode(c.name));
  const namesLen = nameBytes.reduce((n, b) => n + b.length, 0);

  const codes: string[] = [];
  const starts: number[] = [];
  cities.forEach((c, i) => {
    if (c.country !== codes[codes.length - 1]) {
      codes.push(c.country);
      starts.push(i);
    }
  });
  starts.push(cities.length);

  const n = cities.length;
  const codesBytes = align4(codes.length * 2);
  const size =
    HEADER_BYTES +
    n * 4 * 3 +
    (n + 1) * 4 +
    (codes.length + 1) * 4 +
    codesBytes +
    namesLen;

  const buf = new ArrayBuffer(size);
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);

  for (let i = 0; i < 4; i++) bytes[i] = CITIES_MAGIC.charCodeAt(i);
  view.setUint32(4, n, true);
  view.setUint32(8, codes.length, true);
  view.setUint32(12, namesLen, true);

  let off = HEADER_BYTES;
  const lat = new Float32Array(buf, off, n);
  off += n * 4;
  const lon = new Float32Array(buf, off, n);
  off += n * 4;
  const pop = new Uint32Array(buf, off, n);
  off += n * 4;
  const nameOffset = new Uint32Array(buf, off, n + 1);
  off += (n + 1) * 4;
  const countryStart = new Uint32Array(buf, off, codes.length + 1);
  off += (codes.length + 1) * 4;

  cities.forEach((c, i) => {
    lat[i] = c.lat;
    lon[i] = c.lon;
    // Clamped, not wrapped: a bogus population must not become a huge one and
    // win tie-breaks against real cities.
    pop[i] = Math.max(0, Math.min(0xffffffff, Math.round(c.population) || 0));
  });

  let nameAt = 0;
  for (let i = 0; i < n; i++) {
    nameOffset[i] = nameAt;
    nameAt += nameBytes[i].length;
  }
  nameOffset[n] = nameAt;
  countryStart.set(starts);

  for (let i = 0; i < codes.length; i++) {
    bytes[off + i * 2] = codes[i].charCodeAt(0);
    bytes[off + i * 2 + 1] = codes[i].charCodeAt(1);
  }
  off += codesBytes;

  for (let i = 0; i < n; i++) bytes.set(nameBytes[i], off + nameOffset[i]);

  return bytes;
}

export function decodeCities(bytes: Uint8Array): CityTable {
  // A subarray of a bigger pool (what readFileSync returns) is not aligned to
  // its own buffer, and a Float32Array view needs a 4-byte aligned offset, so
  // copy unless this buffer starts where the typed arrays need it to.
  const aligned =
    bytes.byteOffset % 4 === 0 ? bytes : new Uint8Array(bytes.slice());
  const buf = aligned.buffer;
  const base = aligned.byteOffset;
  const view = new DataView(buf, base);

  const magic = String.fromCharCode(...aligned.subarray(0, 4));
  if (magic !== CITIES_MAGIC) {
    throw new Error(`cities: expected ${CITIES_MAGIC}, found "${magic}"`);
  }
  const cityCount = view.getUint32(4, true);
  const countryCount = view.getUint32(8, true);
  const namesLen = view.getUint32(12, true);

  let off = base + HEADER_BYTES;
  const lat = new Float32Array(buf, off, cityCount);
  off += cityCount * 4;
  const lon = new Float32Array(buf, off, cityCount);
  off += cityCount * 4;
  const population = new Uint32Array(buf, off, cityCount);
  off += cityCount * 4;
  const nameOffset = new Uint32Array(buf, off, cityCount + 1);
  off += (cityCount + 1) * 4;
  const countryStart = new Uint32Array(buf, off, countryCount + 1);
  off += (countryCount + 1) * 4;

  const codesAt = off;
  const countryCodes: string[] = [];
  for (let i = 0; i < countryCount; i++) {
    countryCodes.push(
      String.fromCharCode(
        aligned[codesAt - base + i * 2],
        aligned[codesAt - base + i * 2 + 1],
      ),
    );
  }
  off += align4(countryCount * 2);

  const names = new Uint8Array(buf, off, namesLen);
  return {
    cityCount,
    lat,
    lon,
    population,
    nameOffset,
    names,
    countryCodes,
    countryStart,
  };
}

const decoder = new TextDecoder();

/** The name of city `i`, decoded on demand so names stay bytes until needed. */
export function cityName(table: CityTable, i: number): string {
  return decoder.decode(
    table.names.subarray(table.nameOffset[i], table.nameOffset[i + 1]),
  );
}

/** Half-open range of the cities of `iso2`, or null when the country is absent. */
export function countryRange(
  table: CityTable,
  iso2: string,
): [number, number] | null {
  // Binary search: the codes are sorted because the cities were.
  let lo = 0;
  let hi = table.countryCodes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = table.countryCodes[mid];
    if (c === iso2) return [table.countryStart[mid], table.countryStart[mid + 1]];
    if (c < iso2) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}
