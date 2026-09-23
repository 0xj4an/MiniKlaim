import { describe, expect, it, vi } from "vitest";

type Mod = typeof import("./relayerQueue");

async function freshModule(): Promise<Mod> {
  vi.resetModules();
  return import("./relayerQueue");
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("relayer queue", () => {
  it("returns the task's value", async () => {
    const m = await freshModule();
    await expect(m.sendExclusive(async () => 42)).resolves.toBe(42);
  });

  it("never overlaps two tasks", async () => {
    const m = await freshModule();
    let running = 0;
    let maxConcurrent = 0;
    const task = async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await tick(5);
      running -= 1;
    };
    await Promise.all([
      m.sendExclusive(task),
      m.sendExclusive(task),
      m.sendExclusive(task),
    ]);
    expect(maxConcurrent).toBe(1);
  });

  it("preserves submission order", async () => {
    const m = await freshModule();
    const order: number[] = [];
    await Promise.all([
      m.sendExclusive(async () => {
        await tick(9);
        order.push(1);
      }),
      m.sendExclusive(async () => {
        await tick(1);
        order.push(2);
      }),
      m.sendExclusive(async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("a rejected task does not block the queue", async () => {
    const m = await freshModule();
    const failing = m.sendExclusive(async () => {
      throw new Error("boom");
    });
    await expect(failing).rejects.toThrow("boom");
    await expect(m.sendExclusive(async () => "after")).resolves.toBe("after");
  });

  it("a rejected task does not swallow the next task's ordering", async () => {
    const m = await freshModule();
    const order: string[] = [];
    const a = m.sendExclusive(async () => {
      order.push("a");
      throw new Error("boom");
    });
    const b = m.sendExclusive(async () => {
      order.push("b");
    });
    await expect(a).rejects.toThrow("boom");
    await b;
    expect(order).toEqual(["a", "b"]);
  });

  it("propagates a synchronous throw as a rejection", async () => {
    const m = await freshModule();
    await expect(
      m.sendExclusive(() => {
        throw new Error("sync boom");
      }),
    ).rejects.toThrow("sync boom");
    await expect(m.sendExclusive(async () => "still works")).resolves.toBe(
      "still works",
    );
  });
});
