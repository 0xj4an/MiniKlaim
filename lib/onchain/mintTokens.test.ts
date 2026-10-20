import {
  type Address,
  encodeEventTopics,
  type Log,
  recoverTypedDataAddress,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HEXES = "0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B" as Address;
const PLAYER = "0x2bba6b6077304dd0719b1f6348da8f9719a8a4c8" as Address;
const OTHER = "0x8a7927e821f35071439c133f8c510ef6fefc8127" as Address;
const PK = `0x${"11".repeat(32)}` as const;
const H3 = "8c2a306638783ff";

const TRANSFER = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

function transferLog(address: Address, from: Address, to: Address, h3: string): Log {
  return ({
    address,
    topics: encodeEventTopics({
      abi: TRANSFER,
      eventName: "Transfer",
      args: { from, to, tokenId: BigInt(`0x${h3}`) },
    }),
    data: "0x",
    blockHash: null,
    blockNumber: null,
    logIndex: null,
    transactionHash: null,
    transactionIndex: null,
    removed: false,
  }) as unknown as Log;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_CELO_HEXES_ADDRESS", HEXES);
  vi.stubEnv("NEXT_PUBLIC_CELO_BADGES_ADDRESS", HEXES);
  vi.stubEnv("SERVER_SIGNER_PRIVATE_KEY", PK);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tokenIdToH3", () => {
  it("round-trips an H3 cell, keeping the leading zero padding", async () => {
    const { tokenIdToH3 } = await import("./mintTokens");
    expect(tokenIdToH3(BigInt(`0x${H3}`))).toBe(H3);
    expect(tokenIdToH3(0xabcn)).toBe("000000000000abc");
  });
});

describe("mintedTo", () => {
  it("keeps only mints from the Hexes contract to the player", async () => {
    const { mintedTo } = await import("./mintTokens");
    const logs = [
      transferLog(HEXES, zeroAddress, PLAYER, H3),
      // A recapture transfer, not a mint.
      transferLog(HEXES, OTHER, PLAYER, "8c2a306638781ff"),
      // A mint to someone else.
      transferLog(HEXES, zeroAddress, OTHER, "8c2a306638785ff"),
      // Another contract's Transfer.
      transferLog(OTHER, zeroAddress, PLAYER, "8c2a306638787ff"),
    ];
    expect(mintedTo(logs, HEXES, PLAYER)).toEqual([H3]);
  });
});

describe("signMintTokensVoucher", () => {
  it("signs the MintTokens struct the contract verifies", async () => {
    const { signMintTokensVoucher, MINT_VOUCHER_TTL_SEC } = await import("./mintTokens");
    const now = 1_792_000_000_000;
    const v = await signMintTokensVoucher(PLAYER, [H3], "celo", now);
    expect(v).not.toBeNull();
    if (!v) return;
    expect(v.h3Ids).toEqual([BigInt(`0x${H3}`).toString()]);
    expect(Number(v.deadline)).toBe(now / 1000 + MINT_VOUCHER_TTL_SEC);
    const signer = await recoverTypedDataAddress({
      domain: {
        name: "MiniKlaimHexes",
        version: "1",
        chainId: 42220,
        verifyingContract: HEXES,
      },
      types: {
        MintTokens: [
          { name: "player", type: "address" },
          { name: "h3Ids", type: "uint256[]" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "MintTokens",
      message: {
        player: PLAYER,
        h3Ids: [BigInt(`0x${H3}`)],
        nonce: BigInt(v.nonce),
        deadline: BigInt(v.deadline),
      },
      signature: v.signature,
    });
    expect(signer).toBe(privateKeyToAccount(PK).address);
  });

  it("uses a fresh nonce each time", async () => {
    const { signMintTokensVoucher } = await import("./mintTokens");
    const a = await signMintTokensVoucher(PLAYER, [H3], "celo");
    const b = await signMintTokensVoucher(PLAYER, [H3], "celo");
    expect(a?.nonce).not.toBe(b?.nonce);
  });

  it("signs nothing for an empty list", async () => {
    const { signMintTokensVoucher } = await import("./mintTokens");
    expect(await signMintTokensVoucher(PLAYER, [], "celo")).toBeNull();
  });
});
