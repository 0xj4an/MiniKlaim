import { toDataSuffix } from "@celo/attribution-tags";
import { concat, encodeFunctionData, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { settledByClaimTx } from "./claimProof";
import { CLAIM_ROUTER_ABI } from "./claimRouterAbi";
import { HEXES_CLAIM_ABI } from "./hexesAbi";

const PLAYER = "0x00000000000000000000000000000000000c1a1a";
const OTHER = "0x00000000000000000000000000000000000b0b0b";
const HEXES: Address = "0x1111111111111111111111111111111111111111";
const ROUTER: Address = "0x2222222222222222222222222222222222222222";
const H3 = ["8c60b4a3a1a1dff", "8c60b4a3a1a13ff"];
const IDS = H3.map((h) => BigInt(`0x${h}`));
const SIG = "0x1234" as const;

const claimRun = encodeFunctionData({
  abi: HEXES_CLAIM_ABI,
  functionName: "claimRun",
  args: [IDS, 7n, SIG],
});
const claimAll = encodeFunctionData({
  abi: CLAIM_ROUTER_ABI,
  functionName: "claimAll",
  args: [IDS, [3n], 7n, SIG],
});

const base = {
  player: PLAYER,
  status: "success" as const,
  from: PLAYER,
  to: HEXES as string,
  input: claimRun,
  hexesAddress: HEXES,
  routerAddress: ROUTER,
};

describe("settledByClaimTx", () => {
  it("reads the blocks of a claimRun on the Hexes contract", () => {
    expect(settledByClaimTx(base)).toEqual(H3);
  });

  it("reads the blocks of a claimAll on the router", () => {
    expect(settledByClaimTx({ ...base, to: ROUTER, input: claimAll })).toEqual(H3);
  });

  it("still reads them with the attribution suffix appended", () => {
    const tagged = concat([claimRun, toDataSuffix("celo_test1234")]);
    expect(settledByClaimTx({ ...base, input: tagged })).toEqual(H3);
  });

  it("matches addresses whatever their case", () => {
    expect(
      settledByClaimTx({ ...base, from: PLAYER.toUpperCase().replace("0X", "0x"), to: HEXES.toLowerCase() }),
    ).toEqual(H3);
  });

  it("refuses a reverted tx", () => {
    expect(settledByClaimTx({ ...base, status: "reverted" })).toBeNull();
  });

  it("refuses a tx sent by someone other than the run's player", () => {
    expect(settledByClaimTx({ ...base, from: OTHER })).toBeNull();
  });

  it("refuses a tx to any other contract", () => {
    expect(settledByClaimTx({ ...base, to: OTHER })).toBeNull();
    expect(settledByClaimTx({ ...base, to: null })).toBeNull();
  });

  it("refuses calldata that is not the claim call for that contract", () => {
    expect(settledByClaimTx({ ...base, input: claimAll })).toBeNull();
    expect(settledByClaimTx({ ...base, input: "0x" })).toBeNull();
  });

  it("refuses the router when it is not deployed on the chain", () => {
    expect(
      settledByClaimTx({ ...base, to: ROUTER, input: claimAll, routerAddress: null }),
    ).toBeNull();
  });
});
