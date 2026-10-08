import { afterEach, describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { sentryInitOptions } from "./sentryOptions";

describe("sentryInitOptions beforeSend", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("still drops the three non-bugs", () => {
    const event = crash("Connection closed.");
    expect(sentryInitOptions().beforeSend(event)).toBeNull();
  });

  it("keeps the wallet bridge and tags the host", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        ethereum: { isMiniPay: true },
        location: { pathname: "/" },
      },
    });
    const sent = sentryInitOptions().beforeSend(
      crash("The object does not support the operation or argument."),
    );
    expect(sent).not.toBeNull();
    expect(sent?.fingerprint).toEqual(["wallet-bridge-postmessage"]);
    expect(sent?.tags).toMatchObject({ wallet_host: "minipay", pathname: "/" });
  });

  it("leaves a real crash ungrouped", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { pathname: "/run" } },
    });
    const sent = sentryInitOptions().beforeSend(
      crash("Cannot read properties of null (reading 'getSource')"),
    );
    expect(sent?.fingerprint).toBeUndefined();
    expect(sent?.tags).toMatchObject({ wallet_host: "none", pathname: "/run" });
  });
});

function crash(message: string): ErrorEvent {
  return {
    message,
    exception: { values: [{ type: "Error", value: message }] },
  } as ErrorEvent;
}
