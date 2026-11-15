import { describe, expect, test } from "vitest";
import {
  REFUSED_FOR_MS,
  refusedRecently,
  rememberRefusal,
} from "@/lib/wallet/ownerKeyRefusal";

function fakeStore(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set("miniklaim_owner_key_refused", initial);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const WALLET = "0x00000000000000000000000000000000000000A1";
const OTHER = "0x00000000000000000000000000000000000000b2";
const T0 = 1_800_000_000_000;

describe("owner key refusal memo", () => {
  // The bug: the memo was a variable in the page, so a reload asked again.
  test("survives a reload because it lives in storage", () => {
    const store = fakeStore();
    rememberRefusal(store, WALLET, T0);
    expect(refusedRecently(store, WALLET, T0 + 60_000)).toBe(true);
  });

  test("does not care about the case of the address", () => {
    const store = fakeStore();
    rememberRefusal(store, WALLET, T0);
    expect(refusedRecently(store, WALLET.toLowerCase(), T0 + 1)).toBe(true);
  });

  test("asks again once the half hour is over", () => {
    const store = fakeStore();
    rememberRefusal(store, WALLET, T0);
    expect(refusedRecently(store, WALLET, T0 + REFUSED_FOR_MS)).toBe(false);
  });

  test("is per wallet", () => {
    const store = fakeStore();
    rememberRefusal(store, WALLET, T0);
    expect(refusedRecently(store, OTHER, T0 + 1)).toBe(false);
  });

  test("drops the ones that ran out when it writes", () => {
    const store = fakeStore();
    rememberRefusal(store, WALLET, T0);
    rememberRefusal(store, OTHER, T0 + REFUSED_FOR_MS + 1);
    expect(JSON.parse(store.getItem("miniklaim_owner_key_refused")!)).toEqual({
      [OTHER]: T0 + REFUSED_FOR_MS + 1,
    });
  });

  // A phone whose clock moved back must not stay silent for days.
  test("ignores a refusal dated in the future", () => {
    const store = fakeStore(JSON.stringify({ [WALLET.toLowerCase()]: T0 + 86_400_000 }));
    expect(refusedRecently(store, WALLET, T0)).toBe(false);
  });

  test("reads garbage as nothing remembered", () => {
    for (const raw of ["not json", "[]", "null", '{"a":"x"}', "7"]) {
      expect(refusedRecently(fakeStore(raw), "a", T0)).toBe(false);
    }
  });

  test("works with no storage at all", () => {
    rememberRefusal(null, WALLET, T0);
    expect(refusedRecently(null, WALLET, T0)).toBe(false);
  });

  test("a storage that throws does not break the page", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => rememberRefusal(broken, WALLET, T0)).not.toThrow();
    expect(refusedRecently(broken, WALLET, T0)).toBe(false);
  });
});
