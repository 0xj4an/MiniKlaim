export const SUPPORT_EMAIL = "support@miniklaim.fun";

/** Short commit of the deployed build, baked in at build time. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

/**
 * mailto: link with the subject and a body that already carries what support
 * needs to help: wallet, device and app version. Half the support mail used to
 * arrive empty, with no way to tell who wrote or from what phone.
 */
export function supportMailto(opts: {
  subject: string;
  prompt: string;
  wallet?: string | null;
  userAgent?: string;
  locale?: string;
}): string {
  const lines = [
    opts.prompt,
    "",
    "",
    "",
    "---",
    `Wallet: ${opts.wallet ?? "not connected"}`,
    `Device: ${opts.userAgent ?? "unknown"}`,
    `App: ${APP_VERSION}`,
    ...(opts.locale ? [`Lang: ${opts.locale}`] : []),
  ];
  const params = `subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  return `mailto:${SUPPORT_EMAIL}?${params}`;
}
