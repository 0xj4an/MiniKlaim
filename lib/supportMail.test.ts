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
