import { afterEach, describe, expect, it } from "vitest";
import { clientWalletHost } from "./walletHost";

describe("clientWalletHost", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("reads the injected host", () => {
    viStub({ isMiniPay: true, isMetaMask: true });
    expect(clientWalletHost()).toBe("minipay");
    viStub({ isMetaMask: true });
    expect(clientWalletHost()).toBe("metamask");
    viStub({});
    expect(clientWalletHost()).toBe("injected");
  });

  it("is none without a provider and server without window", () => {
    viStub(undefined);
    expect(clientWalletHost()).toBe("none");
    Reflect.deleteProperty(globalThis, "window");
    expect(clientWalletHost()).toBe("server");
  });
});

function viStub(ethereum: object | undefined) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { ethereum },
  });
}
