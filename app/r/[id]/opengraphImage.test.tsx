import { latLngToCell } from "h3-js";
import { ImageResponse } from "next/og";
import { describe, expect, it } from "vitest";
import { notFoundCard, runCard, size } from "./opengraph-image";

// Satori throws on layouts TypeScript accepts (a div with two children and
// no explicit display), and the route then answers 502. These render the
// cards for real and check a PNG comes out, as the profile card's test does.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

async function render(element: React.ReactElement): Promise<Uint8Array> {
  const res = new ImageResponse(element, { ...size });
  return new Uint8Array(await res.arrayBuffer());
}

const street = Array.from({ length: 40 }, (_, i) =>
  latLngToCell(6.45, 3.39 + i * 0.00017, 12),
).filter((h, i, a) => a.indexOf(h) === i);

const base = {
  id: "c1a1c1a1-0000-0000-0000-000000000001",
  username: "sweetbabyzeejay",
  hexesClaimed: 14,
  distanceMeters: 187,
  durationSec: 326,
  moveMode: "foot",
  city: "Lagos",
  country: "NGA",
  h3Ids: street,
};
const labels = {
  player: "A MiniKlaim player",
  blocks: "blocks captured",
  place: "Lagos, Nigeria",
};

describe("run OG image", () => {
  it("renders a run with its outline", async () => {
    const png = await render(runCard(base, labels));
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
    expect(png.byteLength).toBeGreaterThan(1000);
  }, 30000);

  it("renders a run with no name, no place and no blocks left to draw", async () => {
    const png = await render(
      runCard(
        { ...base, username: null, city: null, country: null, h3Ids: [], hexesClaimed: 1, distanceMeters: 0 },
        { player: "Un jugador de MiniKlaim", blocks: "cuadra capturada", place: "" },
      ),
    );
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
  }, 30000);

  it("renders a long drive drawn in coarser cells", async () => {
    const drive = Array.from({ length: 6000 }, (_, i) =>
      latLngToCell(6.45 + i * 0.00012, 3.39 + i * 0.00012, 12),
    );
    const png = await render(
      runCard({ ...base, hexesClaimed: 8346, distanceMeters: 256_000, durationSec: 14_400, h3Ids: drive }, labels),
    );
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
  }, 30000);

  it("renders the not-found card", async () => {
    const png = await render(notFoundCard("Run not found"));
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
  }, 30000);
});
