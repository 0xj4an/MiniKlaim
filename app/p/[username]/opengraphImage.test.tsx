import { ImageResponse } from "next/og";
import { describe, expect, it } from "vitest";
import { notFoundCard, profileCard, size } from "./opengraph-image";

/**
 * Satori (what next/og renders with) throws on a div that has more than one
 * child and no explicit `display`. TypeScript cannot see it and the route
 * answers 502 when it happens. The profile card carried exactly that bug for
 * as long as it existed: the username was undefined, so every preview took
 * the not-found branch and the real card was never rendered until 27 Oct.
 * These render both cards for real and check a PNG comes out.
 */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

async function render(element: React.ReactElement): Promise<Uint8Array> {
  const res = new ImageResponse(element, { ...size });
  return new Uint8Array(await res.arrayBuffer());
}

describe("profile OG image", () => {
  it("renders the player card", async () => {
    const png = await render(
      profileCard(
        { username: "yochabet", hexesOwned: 29064, totalRuns: 77, streak: 11 },
        { blocks: "blocks", runs: "runs", streak: "day streak" },
      ),
    );
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
    expect(png.byteLength).toBeGreaterThan(1000);
  }, 30000);

  it("renders the not-found card", async () => {
    const png = await render(notFoundCard("Player not found"));
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
  }, 30000);

  it("renders a one-day streak and a brand-new player", async () => {
    const png = await render(
      profileCard(
        {
          username: "a_very_long_player_name",
          hexesOwned: 0,
          totalRuns: 0,
          streak: 1,
        },
        { blocks: "bloques", runs: "recorridos", streak: "día seguido" },
      ),
    );
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
  }, 30000);
});
