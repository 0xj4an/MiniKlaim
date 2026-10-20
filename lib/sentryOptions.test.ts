import { afterEach, describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { onlyThirdPartyFrames, sentryInitOptions } from "./sentryOptions";

describe("sentryInitOptions beforeSend", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("still drops the three non-bugs", () => {
    const event = crash("Connection closed.");
    expect(sentryInitOptions().beforeSend(event)).toBeNull();
  });

  it("drops the MiniPay iOS bridge rejection", () => {
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
    expect(sent).toBeNull();
  });

  it("drops a map shader failure", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { pathname: "/run" } },
    });
    expect(
      sentryInitOptions().beforeSend(crash("Could not compile fragment shader: ")),
    ).toBeNull();
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

describe("onlyThirdPartyFrames", () => {
  it("drops errors thrown only inside PostHog's proxied recorder", () => {
    const event = {
      exception: {
        values: [
          {
            type: "SyntaxError",
            value: "Unexpected token ':'",
            stacktrace: { frames: [{ abs_path: "app:///ingest/static/posthog-recorder.js?v=1.414.0" }] },
          },
        ],
      },
    } as unknown as ErrorEvent;
    expect(onlyThirdPartyFrames(event)).toBe(true);
  });
  it("keeps errors with our own frames", () => {
    const event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { abs_path: "app:///ingest/static/posthog-recorder.js" },
                { abs_path: "app:///_next/static/chunks/app.js" },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;
    expect(onlyThirdPartyFrames(event)).toBe(false);
  });
});
