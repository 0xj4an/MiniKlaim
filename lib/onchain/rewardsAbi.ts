// Slim ABI for reads + the client's `claimRewards` call. Kept separate from
// the deploy bytecode so app bundles do not pull the full contract artifact.

export const REWARDS_ABI = [
  {
    type: "function",
    name: "claimRewards",
    stateMutability: "nonpayable",
    inputs: [
      { name: "badgeIds", type: "uint256[]" },
      { name: "nonce", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [
      { name: "player", type: "address" },
      { name: "badgeId", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "rewardAmount",
    stateMutability: "view",
    inputs: [{ name: "badgeId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "rewardToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;
