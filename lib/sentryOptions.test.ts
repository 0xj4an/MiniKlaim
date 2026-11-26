import { afterEach, describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import {
  isDatabaseUnavailable,
  onlyThirdPartyFrames,
  sentryInitOptions,
} from "./sentryOptions";

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

  it("keeps a WebGL failure that crashed into the error boundary", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { pathname: "/community" } },
    });
    const event = crash('{"type":"webglcontextcreationerror","message":"Failed to initialize WebGL"}');
    event.tags = { boundary: "app" };
    const sent = sentryInitOptions().beforeSend(event);
    expect(sent).not.toBeNull();
    expect(sent?.tags).toMatchObject({ boundary: "app", pathname: "/community" });
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

describe("database outage grouping", () => {
  const send = (values: string[]) => {
    const { beforeSend } = sentryInitOptions();
    const event = {
      exception: { values: values.map((value) => ({ type: "Error", value })) },
    } as ErrorEvent;
    return beforeSend(event) as ErrorEvent | null;
  };

  it("files every route's failure during an outage under one issue", () => {
    const a = send([
      "getaddrinfo ENOTFOUND postgres",
      'Failed query: select "player_id" from "player_wallets" params: x,1',
    ]);
    const b = send([
      "terminating connection due to administrator command",
      'Failed query: insert into "users" params: y',
    ]);
    expect(a?.fingerprint).toEqual(["database-unavailable"]);
    expect(b?.fingerprint).toEqual(["database-unavailable"]);
    expect(a?.level).toBe("warning");
    expect(a?.tags?.outage).toBe("database");
  });

  it("leaves a query that failed on its own merits alone", () => {
    const e = send(['Failed query: select 1 params: ', 'column "x" does not exist']);
    expect(e?.fingerprint).toBeUndefined();
    expect(e?.level).toBeUndefined();
  });

  it("does not take an RPC node refusing a connection for the database", () => {
    expect(isDatabaseUnavailable("connect ECONNREFUSED 10.0.0.9:8545")).toBe(false);
    expect(isDatabaseUnavailable("connect ECONNREFUSED 172.18.0.4:5432")).toBe(true);
  });
});
