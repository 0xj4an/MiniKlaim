import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ host: "miniklaim.fun", "x-forwarded-proto": "https" }),
}));

import { fetchOwnApi } from "./ownApi";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchOwnApi", () => {
  it("asks through the address the request came in on", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await fetchOwnApi("/api/profile/ada");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://miniklaim.fun/api/profile/ada",
    );
  });

  it("falls back to the loopback address when the lookup fails", async () => {
    vi.stubEnv("PORT", "3000");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchOwnApi("/api/profile/ada");
    expect(res.ok).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://127.0.0.1:3000/api/profile/ada",
    );
  });

  it("does not retry an answer, even a bad one", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () => new Response("no", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchOwnApi("/api/profile/nobody");
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports the first failure when both addresses fail", async () => {
    const first = new TypeError("fetch failed");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(first)
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchOwnApi("/api/profile/ada")).rejects.toBe(first);
  });
});
