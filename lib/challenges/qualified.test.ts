import { describe, expect, it } from "vitest";
import { resolveQualified } from "./qualified";

const deps = (wallets: Record<string, string[]>, held: Record<string, number[]>) => ({
  walletsOf: async (a: string) => wallets[a] ?? [a],
  heldOf: async (w: string) => held[w] ?? [],
});

describe("resolveQualified", () => {
  it("counts only entrants holding every badge", async () => {
    const out = await resolveQualified(
      ["0xa", "0xb", "0xc"],
      [1, 2],
      deps({}, { "0xa": [1, 2, 9], "0xb": [1], "0xc": [] }),
    );
    expect(out.qualified).toEqual(["0xa"]);
    expect(out.detail).toEqual([
      { player: "0xa", held: [1, 2] },
      { player: "0xb", held: [1] },
      { player: "0xc", held: [] },
    ]);
  });

  it("adds up the badges across a player's linked wallets", async () => {
    const out = await resolveQualified(
      ["0xa"],
      [1, 2],
      deps({ "0xa": ["0xa", "0xz"] }, { "0xa": [1], "0xz": [2] }),
    );
    expect(out.qualified).toEqual(["0xa"]);
  });

  it("gives one ticket to a person who entered from two linked wallets", async () => {
    const linked = { "0xa": ["0xa", "0xb"], "0xb": ["0xa", "0xb"] };
    const out = await resolveQualified(
      ["0xb", "0xa"],
      [1],
      deps(linked, { "0xa": [1], "0xb": [1] }),
    );
    expect(out.qualified).toEqual(["0xb"]);
    expect(out.detail[1]).toEqual({ player: "0xa", held: [] });
  });

  it("qualifies nobody when there is nobody", async () => {
    expect((await resolveQualified([], [1], deps({}, {}))).qualified).toEqual([]);
  });
});
