import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSupportRateLimit } from "@/lib/supportRateLimit";
import { POST } from "./route";

function form(fields: Record<string, string | File>): Request {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("https://www.miniklaim.fun/api/support", {
    method: "POST",
    body,
    headers: {
      "x-forwarded-for": "203.0.113.7",
      "user-agent": "Mozilla/5.0 (Linux; Android 15)",
    },
  });
}

const valid = {
  topic: "start",
  description: "I tapped Start and the map stayed white",
  email: "player@example.com",
  wallet: "0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856",
  locale: "en",
  appVersion: "abc1234",
};

describe("POST /api/support", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetSupportRateLimit();
    process.env.RESEND_API_KEY = "re_test";
    fetchMock
      .mockReset()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "x" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("sends the ticket to support with reply-to set to the player", async () => {
    const res = await POST(form(valid));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(init.body);
    expect(payload.to).toEqual(["support@miniklaim.fun"]);
    expect(payload.reply_to).toBe("player@example.com");
    expect(payload.subject).toBe("MiniKlaim support · Can't start a run");
    expect(payload.text).toContain(
      "Wallet: 0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856",
    );
  });

  it("rejects an empty description without sending anything", async () => {
    const res = await POST(form({ ...valid, description: "Hi" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "description" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops bot submissions silently", async () => {
    const res = await POST(form({ ...valid, website: "http://spam.example" }));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attaches a screenshot", async () => {
    const shot = new File([new Uint8Array([137, 80, 78, 71])], "s.png", {
      type: "image/png",
    });
    const res = await POST(form({ ...valid, screenshot: shot }));
    expect(res.status).toBe(200);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.attachments).toEqual([
      { filename: "screenshot.png", content: "iVBORw==" },
    ]);
  });

  it("rate limits after three messages", async () => {
    for (let i = 0; i < 3; i++)
      expect((await POST(form(valid))).status).toBe(200);
    expect((await POST(form(valid))).status).toBe(429);
  });

  it("answers 503 when Resend is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    expect((await POST(form(valid))).status).toBe(503);
  });

  it("answers 502 when Resend rejects the mail", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 422 }));
    expect((await POST(form(valid))).status).toBe(502);
  });
});
