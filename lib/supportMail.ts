export const SUPPORT_EMAIL = "support@miniklaim.fun";

/** Short commit of the deployed build, baked in at build time. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

/** What the player's problem is about. Picked in the support form. */
export const SUPPORT_TOPICS = ["start", "claim", "wallet", "badges", "other"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/**
 * Shortest description the support form accepts. 37 of 63 support emails up to
 * 20 Oct 2026 arrived empty or with just a name, and the two that came through
 * the prefilled mailto still had only the template. A sentence is enough.
 */
export const SUPPORT_MIN_CHARS = 15;

export function isDescriptionValid(text: string): boolean {
  return text.trim().replace(/\s+/g, " ").length >= SUPPORT_MIN_CHARS;
}

/**
 * mailto: link with the subject and a body that already carries what support
 * needs to help: the player's description, wallet, device and app version.
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
