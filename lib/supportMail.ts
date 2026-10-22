export const SUPPORT_EMAIL = "support@miniklaim.fun";

/** Short commit of the deployed build, baked in at build time. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

/** What the player's problem is about. Picked in the support form. */
export const SUPPORT_TOPICS = ["start", "claim", "wallet", "badges", "other"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/** English labels for the subject line support reads, whatever the app locale. */
export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  start: "Can't start a run",
  claim: "Claiming blocks",
  wallet: "Wallet or MiniPay",
  badges: "Badges or rewards",
  other: "Something else",
};

/**
 * Shortest description the support form accepts. 37 of 63 support emails up to
 * 20 Oct 2026 arrived empty or with just a name, and the two that came through
 * the prefilled mailto still had only the template. A sentence is enough.
 */
export const SUPPORT_MIN_CHARS = 15;
export const SUPPORT_MAX_CHARS = 2000;

/** One optional screenshot, sent to support as an attachment. */
export const SUPPORT_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

function squash(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function isDescriptionValid(text: string): boolean {
  const length = squash(text).length;
  return length >= SUPPORT_MIN_CHARS && length <= SUPPORT_MAX_CHARS;
}

export function isEmailValid(email: string): boolean {
  const value = email.trim();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function isSupportTopic(value: unknown): value is SupportTopic {
  return typeof value === "string" && (SUPPORT_TOPICS as readonly string[]).includes(value);
}

export type SupportRequest = {
  topic: SupportTopic;
  description: string;
  email: string;
  wallet: string | null;
  locale: string | null;
  appVersion: string | null;
};

export type SupportError = "topic" | "description" | "email" | "wallet";

/** Validates the fields the form posts. Pure, so the route and tests share it. */
export function parseSupportRequest(fields: {
  topic?: unknown;
  description?: unknown;
  email?: unknown;
  wallet?: unknown;
  locale?: unknown;
  appVersion?: unknown;
}): { ok: true; data: SupportRequest } | { ok: false; error: SupportError } {
  if (!isSupportTopic(fields.topic)) return { ok: false, error: "topic" };
  const description = typeof fields.description === "string" ? fields.description.trim() : "";
  if (!isDescriptionValid(description)) return { ok: false, error: "description" };
  const email = typeof fields.email === "string" ? fields.email.trim() : "";
  if (!isEmailValid(email)) return { ok: false, error: "email" };
  const rawWallet = typeof fields.wallet === "string" ? fields.wallet.trim() : "";
  if (rawWallet && !/^0x[a-fA-F0-9]{40}$/.test(rawWallet)) return { ok: false, error: "wallet" };
  const short = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : null;
  return {
    ok: true,
    data: {
      topic: fields.topic,
      description,
      email,
      wallet: rawWallet || null,
      locale: short(fields.locale),
      appVersion: short(fields.appVersion),
    },
  };
}

/** Subject and plain-text body of the message support receives. */
export function buildSupportEmail(
  req: SupportRequest,
  meta: { userAgent?: string | null; screenshot?: boolean },
): { subject: string; text: string } {
  return {
    subject: `MiniKlaim support · ${SUPPORT_TOPIC_LABELS[req.topic]}`,
    text: [
      req.description,
      "",
      "---",
      `Topic: ${SUPPORT_TOPIC_LABELS[req.topic]}`,
      `Reply to: ${req.email}`,
      `Wallet: ${req.wallet ?? "not connected"}`,
      `Device: ${meta.userAgent || "unknown"}`,
      `App: ${req.appVersion ?? "unknown"}`,
      `Lang: ${req.locale ?? "unknown"}`,
      `Screenshot: ${meta.screenshot ? "attached" : "none"}`,
      "Sent from the in-app support form.",
    ].join("\n"),
  };
}

/**
 * mailto: link with the subject and a body that already carries what support
 * needs to help. Only a fallback now: the form posts to /api/support, and this
 * opens when that request fails.
 */
export function supportMailto(opts: {
  subject: string;
  prompt: string;
  description?: string;
  topicLabel?: string;
  wallet?: string | null;
  userAgent?: string;
  locale?: string;
}): string {
  const subject = opts.topicLabel ? `${opts.subject} · ${opts.topicLabel}` : opts.subject;
  const lines = [
    opts.prompt,
    ...(opts.description?.trim() ? [opts.description.trim()] : ["", ""]),
    "",
    "---",
    `Wallet: ${opts.wallet ?? "not connected"}`,
    `Device: ${opts.userAgent ?? "unknown"}`,
    `App: ${APP_VERSION}`,
    ...(opts.locale ? [`Lang: ${opts.locale}`] : []),
  ];
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  return `mailto:${SUPPORT_EMAIL}?${params}`;
}
