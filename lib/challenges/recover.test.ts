import { describe, expect, it, vi } from "vitest";
import { findEntryTx, isLaggingNode, withLaggingNodeRetry } from "./recover";

const named = (name: string, cause?: unknown) =>
  Object.assign(new Error(name), { name, cause });

describe("withLaggingNodeRetry", () => {
  it("asks again when the node is a block behind, then answers", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(named("BlockNotFoundError"))
      .mockRejectedValueOnce(named("Wrapper", named("TransactionReceiptNotFoundError")))
      .mockResolvedValue("receipt");
    const sleep = vi.fn(async () => undefined);
    expect(await withLaggingNodeRetry(read, { sleep })).toBe("receipt");
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempts and rethrows the node's error", async () => {
    const read = vi.fn().mockRejectedValue(named("BlockNotFoundError"));
    await expect(
      withLaggingNodeRetry(read, { attempts: 3, sleep: async () => undefined }),
    ).rejects.toThrow("BlockNotFoundError");
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("does not retry anything else", async () => {
    const read = vi.fn().mockRejectedValue(named("ContractFunctionRevertedError"));
    await expect(withLaggingNodeRetry(read)).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
    expect(isLaggingNode("text")).toBe(false);
  });
});

describe("findEntryTx", () => {
  it("walks back in 5,000-block chunks and stops at the first hit", async () => {
    const getLogs = vi.fn(async ({ fromBlock }: { fromBlock: bigint; toBlock: bigint }) =>
      fromBlock === 80_001n ? [{ transactionHash: "0xabc" as const }] : [],
    );
    expect(await findEntryTx(100_000n, getLogs)).toBe("0xabc");
    expect(getLogs.mock.calls.map((c) => [c[0].fromBlock, c[0].toBlock])).toEqual([
      [95_001n, 100_000n],
      [90_001n, 95_000n],
      [85_001n, 90_000n],
      [80_001n, 85_000n],
    ]);
  });

  it("returns null past its reach, and at the start of the chain", async () => {
    const none = vi.fn(async () => []);
    expect(await findEntryTx(1_000_000n, none, 3)).toBeNull();
    expect(none).toHaveBeenCalledTimes(3);
    const short = vi.fn(
      async (_range: { fromBlock: bigint; toBlock: bigint }) => [],
    );
    expect(await findEntryTx(7_000n, short)).toBeNull();
    expect(short.mock.calls.map((c) => [c[0].fromBlock, c[0].toBlock])).toEqual([
      [2_001n, 7_000n],
      [0n, 2_000n],
    ]);
  });
});
