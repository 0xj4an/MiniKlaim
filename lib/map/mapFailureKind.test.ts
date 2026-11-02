import { describe, expect, it } from "vitest";
import { shouldRaiseToSentry } from "./mapFailureKind";

// The message that arrived in production within half an hour of the new
// reporting shipping, from a phone running outdoors.
const REAL =
  "AJAXError: Failed to fetch (tiles.openfreemap.org) (0): https://tiles.openfreemap.org/styles/positron";

describe("shouldRaiseToSentry", () => {
  it("keeps a request that never completed out of Sentry", () => {
    expect(shouldRaiseToSentry("style", REAL)).toBe(false);
  });

  it("covers the other ways a browser words a dead request", () => {
    for (const m of [
      "TypeError: NetworkError when attempting to fetch resource.",
      "Load failed",
      "net::ERR_INTERNET_DISCONNECTED",
      "AJAXError: Failed to fetch (tiles.example.org) (0): https://tiles.example.org/x",
    ]) {
      expect(shouldRaiseToSentry("style", m)).toBe(false);
    }
  });

  it("still raises a tile host that answered with an error", () => {
    // A status means the request arrived and the host refused it, which is
    // ours to notice: a dead key, a moved style, an outage.
    expect(
      shouldRaiseToSentry(
        "style",
        "AJAXError: Forbidden (403): https://tiles.example.org/s",
      ),
    ).toBe(true);
    expect(
      shouldRaiseToSentry(
        "style",
        "AJAXError: Not Found (404): https://tiles.example.org/s",
      ),
    ).toBe(true);
    expect(
      shouldRaiseToSentry("style", "Invalid style: layers[3] is malformed"),
    ).toBe(true);
  });

  it("raises every other stage, network words or not", () => {
    // A bundle that will not load, a GPU that refuses, a frame that throws:
    // all ours, whatever the message happens to say.
    expect(
      shouldRaiseToSentry(
        "import",
        "Failed to fetch dynamically imported module",
      ),
    ).toBe(true);
    expect(shouldRaiseToSentry("construct", "WebGL2 not supported")).toBe(true);
    expect(shouldRaiseToSentry("draw", "Load failed")).toBe(true);
  });
});
