import { encodeAbiParameters, keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import { dropCommitment, dropIdToUint, h3ToUint64, hintCell } from "@/lib/drops/ids";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const H3 = "8c661836d02cdff";
const SALT = `0x${"11".repeat(32)}` as const;

describe("drop ids", () => {
  it("reads the uuid as a uint256", () => {
    expect(dropIdToUint(ID)).toBe(0x0f8fad5bd9cb469fa16570867728950en);
    expect(() => dropIdToUint("nope")).toThrow();
  });

  it("reads an h3 index as uint64", () => {
    expect(h3ToUint64(H3)).toBe(0x8c661836d02cdffn);
    expect(() => h3ToUint64("zz")).toThrow();
  });

  it("commits like MiniKlaimDrops.reveal checks: keccak256(abi.encode(id, uint64, bytes32))", () => {
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint64" }, { type: "bytes32" }],
        [0x0f8fad5bd9cb469fa16570867728950en, 0x8c661836d02cdffn, SALT],
      ),
    );
    expect(dropCommitment(ID, H3, SALT)).toBe(expected);
  });

  it("hints at the res-8 parent", () => {
    expect(hintCell(H3)).toBe("88661836d1fffff");
  });
});
