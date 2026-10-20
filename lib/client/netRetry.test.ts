import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithRetry,
  isNetworkError,
  isSponsorInProgress,
} from "@/lib/client/netRetry";

const noSleep = () => Promise.resolve();

afterEach(() => vi.unstubAllGlobals());

describe("isNetworkError", () => {
  it("matches Safari, Chrome and old WebView wording", () => {
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("network error"))).toBe(true);
  });
  it("ignores app errors and aborts", () => {
    expect(isNetworkError(new Error("voucher status 500"))).toBe(false);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isNetworkError(abort)).toBe(false);
  });
});

describe("fetchWithRetry", () => {
  it("retries a dropped request and returns the answer", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry(
      "/x",
      { method: "POST" },
      { sleep: noSleep },
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("retries a gateway error, then gives the last response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("/x", {}, { sleep: noSleep, retries: 2 });
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("does not retry a refusal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 402 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWithRetry("/x", {}, { sleep: noSleep });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("throws after the last network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(fetchWithRetry("/x", {}, { sleep: noSleep })).rejects.toThrow(
      "Failed to fetch",
    );
  });
});

describe("isSponsorInProgress", () => {
  it("reads the in-flight 409", async () => {
    const res = new Response(JSON.stringify({ error: "already in progress" }), {
      status: 409,
    });
    expect(await isSponsorInProgress(res)).toBe(true);
    const other = new Response(JSON.stringify({ error: "run not finished" }), {
      status: 409,
    });
    expect(await isSponsorInProgress(other)).toBe(false);
  });
});
