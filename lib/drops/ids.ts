import { cellToParent } from "h3-js";
import { encodeAbiParameters, type Hex, keccak256 } from "viem";

/** The onchain dropId: the row's uuid read as a uint256. */
export function dropIdToUint(id: string): bigint {
  const hex = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`bad drop id: ${id}`);
  return BigInt(`0x${hex}`);
}

/** H3 index string (15 hex chars) as the uint64 the contract reveals. */
export function h3ToUint64(h3: string): bigint {
  if (!/^[0-9a-f]{15,16}$/i.test(h3)) throw new Error(`bad h3: ${h3}`);
  return BigInt(`0x${h3}`);
}

/** keccak256(abi.encode(dropId, uint64 h3, bytes32 salt)), as MiniKlaimDrops.reveal checks. */
export function dropCommitment(id: string, h3: string, salt: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint64" }, { type: "bytes32" }],
      [dropIdToUint(id), h3ToUint64(h3), salt],
    ),
  );
}

/** Res-8 hint cell for a res-12 drop block. */
export function hintCell(h3: string): string {
  return cellToParent(h3, 8);
}
