import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { extensionSource } from "@/lib/sentryOptions";

describe("extensionSource", () => {
  const ev = (paths: string[], value: string) =>
    ({
      exception: {
        values: [{ value, stacktrace: { frames: paths.map((abs_path) => ({ abs_path })) } }],
      },
    }) as unknown as ErrorEvent;

  it("names MetaMask when every frame is its injected script (MINIKLAIM-13)", () => {
    expect(
      extensionSource(ev(["app:///scripts/inpage.js", "app:///scripts/inpage.js"], "Failed to connect to MetaMask")),
    ).toBe("metamask");
  });
  it("reads chrome-extension frames", () => {
    expect(extensionSource(ev(["chrome-extension://abc/content.js"], "boom"))).toBe("unknown");
  });
  it("leaves errors with our own frames alone", () => {
    expect(
      extensionSource(ev(["app:///scripts/inpage.js", "app:///_next/static/chunks/app.js"], "x")),
    ).toBeNull();
  });
});
