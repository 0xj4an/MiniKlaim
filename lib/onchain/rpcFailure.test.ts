import { describe, expect, it } from "vitest";
import { describeRpcFailure } from "./rpcFailure";

describe("describeRpcFailure", () => {
  it("keeps the node's own reason from deep in the chain", () => {
    const rpc = Object.assign(new Error("nonce too low"), {
      name: "RpcRequestError",
      code: -32000,
      data: { reason: "nonce" },
    });
    const invalid = Object.assign(new Error("Missing or invalid parameters. ".padEnd(900, "x")), {
      name: "InvalidParamsRpcError",
      code: -32602,
      shortMessage: "Missing or invalid parameters.",
      details: "transaction underpriced: tip needed 5, tip permitted 1",
      cause: rpc,
    });
    const top = Object.assign(new Error("send failed"), {
      name: "TransactionExecutionError",
      shortMessage: "Missing or invalid parameters.",
      cause: invalid,
    });
    const out = describeRpcFailure(top);
    expect(out.name).toBe("TransactionExecutionError");
    expect(out.code).toBe("-32602");
    expect(out.details).toBe("transaction underpriced: tip needed 5, tip permitted 1");
    expect(out.data).toBe('{"reason":"nonce"}');
    expect(out.causes).toHaveLength(3);
    expect(out.causes[2]).toContain("code=-32000");
  });

  it("copes with a plain string and with a cycle", () => {
    expect(describeRpcFailure("boom").causes).toEqual([]);
    const loop: Record<string, unknown> = { name: "Loop", message: "again" };
    loop.cause = loop;
    expect(describeRpcFailure(loop).causes).toHaveLength(6);
  });
});
