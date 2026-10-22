import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import {
  buildSupportEmail,
  parseSupportRequest,
  SUPPORT_EMAIL,
  SUPPORT_SCREENSHOT_MAX_BYTES,
  SUPPORT_SCREENSHOT_TYPES,
} from "@/lib/supportMail";
import { allowSupportRequest } from "@/lib/supportRateLimit";

export const dynamic = "force-dynamic";

const log = createLogger("support");
const FROM = `MiniKlaim App <app@miniklaim.fun>`;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Support form. Sends the player's message to support@ through Resend with
 * reply-to set to the player, so every ticket has a topic, a real description,
 * a reply address and the wallet/device/app version, instead of the empty
 * emails the old mailto produced.
 */
export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Honeypot: real players never see or fill this field.
  if (String(form.get("website") ?? "").trim()) {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseSupportRequest({
    topic: form.get("topic"),
    description: form.get("description"),
    email: form.get("email"),
    wallet: form.get("wallet"),
    locale: form.get("locale"),
    appVersion: form.get("appVersion"),
  });
  if (parsed.ok === false) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const screenshot = form.get("screenshot");
  let attachment: { filename: string; content: string } | null = null;
  if (screenshot instanceof File && screenshot.size > 0) {
    if (screenshot.size > SUPPORT_SCREENSHOT_MAX_BYTES) {
      return NextResponse.json({ error: "screenshot_size" }, { status: 400 });
    }
    if (
      !(SUPPORT_SCREENSHOT_TYPES as readonly string[]).includes(screenshot.type)
    ) {
      return NextResponse.json({ error: "screenshot_type" }, { status: 400 });
    }
    const ext = screenshot.type.split("/")[1].replace("jpeg", "jpg");
    attachment = {
      filename: `screenshot.${ext}`,
      content: Buffer.from(await screenshot.arrayBuffer()).toString("base64"),
    };
  }

  const key = `${clientIp(request)}|${parsed.data.wallet ?? parsed.data.email.toLowerCase()}`;
  if (!allowSupportRequest(key)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { subject, text } = buildSupportEmail(parsed.data, {
    userAgent: request.headers.get("user-agent"),
    screenshot: attachment !== null,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [SUPPORT_EMAIL],
        reply_to: parsed.data.email,
        subject,
        text,
        ...(attachment ? { attachments: [attachment] } : {}),
      }),
    });
    if (!res.ok) {
      log.error("resend rejected support mail", {
        status: res.status,
        body: await res.text(),
      });
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }
  } catch (err) {
    log.error("resend request failed", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
