import { describe, expect, it } from "vitest";
import { supportMailto } from "@/lib/supportMail";

describe("supportMailto", () => {
  it("fills subject and a body with wallet, device and version", () => {
    const href = supportMailto({
      subject: "MiniKlaim support",
      prompt: "Tell us what happened:",
      wallet: "0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856",
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
      locale: "es",
    });
    expect(
      href.startsWith(
        "mailto:support@miniklaim.fun?subject=MiniKlaim%20support&body=",
      ),
    ).toBe(true);
    const body = decodeURIComponent(href.split("&body=")[1]);
    expect(body).toContain(
      "Wallet: 0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856",
    );
    expect(body).toContain("Device: Mozilla/5.0 (Linux; Android 14)");
    expect(body).toContain("App: ");
    expect(body).toContain("Lang: es");
  });

  it("says when no wallet is connected", () => {
    const body = decodeURIComponent(
      supportMailto({ subject: "s", prompt: "p" }).split("&body=")[1],
    );
    expect(body).toContain("Wallet: not connected");
  });
});

describe("support form rules", () => {
  it("needs a real sentence, not the template or a name", async () => {
    const { isDescriptionValid } = await import("@/lib/supportMail");
    expect(isDescriptionValid("")).toBe(false);
    expect(isDescriptionValid("Garzali aliyu")).toBe(false);
    expect(isDescriptionValid("   Hi    ")).toBe(false);
    expect(isDescriptionValid("The map stays white and Start does nothing")).toBe(true);
  });

  it("puts the description and the topic in the mail", () => {
    const href = supportMailto({
      subject: "MiniKlaim support",
      prompt: "Tell us what happened:",
      description: "Claim button spins forever",
      topicLabel: "Claiming blocks",
    });
    expect(href).toContain("subject=MiniKlaim%20support%20%C2%B7%20Claiming%20blocks");
    const body = decodeURIComponent(href.split("&body=")[1]);
    expect(body.startsWith("Tell us what happened:\nClaim button spins forever\n")).toBe(true);
  });
});

describe("parseSupportRequest", () => {
  const base = {
    topic: "claim",
    description: "The claim button spins forever after my run",
    email: "player@example.com",
    wallet: "0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856",
    locale: "en",
    appVersion: "474b888",
  };

  it("accepts a complete request", async () => {
    const { parseSupportRequest } = await import("@/lib/supportMail");
    const parsed = parseSupportRequest(base);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.topic).toBe("claim");
      expect(parsed.data.wallet).toBe(base.wallet);
    }
  });

  it("rejects what used to reach the inbox", async () => {
    const { parseSupportRequest } = await import("@/lib/supportMail");
    expect(parseSupportRequest({ ...base, topic: "money" })).toEqual({ ok: false, error: "topic" });
    expect(parseSupportRequest({ ...base, description: "Garzali aliyu" })).toEqual({
      ok: false,
      error: "description",
    });
    expect(parseSupportRequest({ ...base, description: "0726919614" })).toEqual({
      ok: false,
      error: "description",
    });
    expect(parseSupportRequest({ ...base, email: "Amospapa688" })).toEqual({ ok: false, error: "email" });
    expect(parseSupportRequest({ ...base, wallet: "0x123" })).toEqual({ ok: false, error: "wallet" });
  });

  it("allows a player without a connected wallet", async () => {
    const { parseSupportRequest } = await import("@/lib/supportMail");
    const parsed = parseSupportRequest({ ...base, wallet: "" });
    expect(parsed.ok && parsed.data.wallet).toBe(null);
  });
});

describe("buildSupportEmail", () => {
  it("puts the topic in the subject and the context under the description", async () => {
    const { buildSupportEmail } = await import("@/lib/supportMail");
    const mail = buildSupportEmail(
      {
        topic: "start",
        description: "I tapped Start and the map stayed white",
        email: "player@example.com",
        wallet: null,
        locale: "es",
        appVersion: "abc1234",
      },
      { userAgent: "Mozilla/5.0 (Linux; Android 15)", screenshot: true },
    );
    expect(mail.subject).toBe("MiniKlaim support · Can't start a run");
    expect(mail.text.startsWith("I tapped Start and the map stayed white\n")).toBe(true);
    expect(mail.text).toContain("Reply to: player@example.com");
    expect(mail.text).toContain("Wallet: not connected");
    expect(mail.text).toContain("App: abc1234");
    expect(mail.text).toContain("Screenshot: attached");
  });
});

describe("allowSupportRequest", () => {
  it("lets three messages through per hour and key", async () => {
    const { allowSupportRequest, resetSupportRateLimit } = await import("@/lib/supportRateLimit");
    resetSupportRateLimit();
    const now = 1_000_000;
    expect(allowSupportRequest("ip|wallet", now)).toBe(true);
    expect(allowSupportRequest("ip|wallet", now + 1)).toBe(true);
    expect(allowSupportRequest("ip|wallet", now + 2)).toBe(true);
    expect(allowSupportRequest("ip|wallet", now + 3)).toBe(false);
    expect(allowSupportRequest("other", now + 3)).toBe(true);
    expect(allowSupportRequest("ip|wallet", now + 60 * 60 * 1000 + 1)).toBe(true);
  });
});
