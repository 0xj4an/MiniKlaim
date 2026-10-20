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
