"use client";

import { useEffect, useState } from "react";
import { CloseButton } from "@/app/CloseButton";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18nDict";
import {
  APP_VERSION,
  isDescriptionValid,
  isEmailValid,
  SUPPORT_MAX_CHARS,
  SUPPORT_MIN_CHARS,
  SUPPORT_SCREENSHOT_MAX_BYTES,
  SUPPORT_TOPICS,
  type SupportTopic,
  supportMailto,
} from "@/lib/supportMail";
import { useWallet } from "@/lib/wallet/useWallet";

const EMAIL_KEY = "miniklaim.support.email";

function readSavedEmail(): string {
  try {
    return window.localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveEmail(email: string) {
  try {
    window.localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // Private mode or blocked storage: the player just types it again next time.
  }
}

/**
 * Contact support. Opens an in-app form (topic, a required description, a reply
 * email and an optional screenshot) that posts to /api/support. The wallet,
 * device and app version are added for the player. The support address is no
 * longer shown as link text: players copied it and sent empty emails.
 */
export function SupportLink({
  className,
  label,
}: {
  className?: string;
  /** Link text; defaults to "Contact support". */
  label?: string;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          track("support_form_opened", {});
          setOpen(true);
        }}
      >
        {label ?? t("support.link.contact")}
      </button>
      {open && <SupportForm onClose={() => setOpen(false)} />}
    </>
  );
}

type Status = "idle" | "sending" | "sent" | "error" | "rate_limited";

function SupportForm({ onClose }: { onClose: () => void }) {
  const { t, locale } = useLocale();
  const { address } = useWallet();
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [website, setWebsite] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    setEmail(readSavedEmail());
  }, []);

  const screenshotTooBig = screenshot !== null && screenshot.size > SUPPORT_SCREENSHOT_MAX_BYTES;
  const valid =
    topic !== null && isDescriptionValid(text) && isEmailValid(email) && !screenshotTooBig;

  const topicLabel = topic ? t(`support.topic.${topic}` as TranslationKey) : undefined;
  const fallbackHref = supportMailto({
    subject: t("support.subject"),
    prompt: t("support.body"),
    description: text,
    topicLabel,
    wallet: address,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    locale,
  });

  async function send() {
    setTouched(true);
    if (!valid || !topic || status === "sending") return;
    setStatus("sending");
    const body = new FormData();
    body.set("topic", topic);
    body.set("description", text.trim());
    body.set("email", email.trim());
    body.set("wallet", address ?? "");
    body.set("locale", locale);
    body.set("appVersion", APP_VERSION);
    body.set("website", website);
    if (screenshot) body.set("screenshot", screenshot);
    try {
      const res = await fetch("/api/support", { method: "POST", body });
      if (res.ok) {
        saveEmail(email.trim());
        track("support_sent", { topic, chars: text.trim().length, screenshot: screenshot !== null });
        setStatus("sent");
        return;
      }
      track("support_failed", { status: res.status });
      setStatus(res.status === 429 ? "rate_limited" : "error");
    } catch {
      track("support_failed", { status: 0 });
      setStatus("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-form-title"
        className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CloseButton onClick={onClose} className="absolute top-3 right-3" />
        <p id="support-form-title" className="pr-8 text-base font-bold text-zinc-900">
          {status === "sent" ? t("support.form.sentTitle") : t("support.form.title")}
        </p>

        {status === "sent" ? (
          <>
            <p className="mt-3 text-sm text-zinc-700">
              {t("support.form.sentBody").replace("{email}", email.trim())}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white"
            >
              {t("support.form.done")}
            </button>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm font-medium text-zinc-700">{t("support.form.topic")}</p>
            <div role="radiogroup" className="mt-2 flex flex-wrap gap-2">
              {SUPPORT_TOPICS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={topic === id}
                  onClick={() => setTopic(id)}
                  className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${
                    topic === id
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-700"
                  }`}
                >
                  {t(`support.topic.${id}` as TranslationKey)}
                </button>
              ))}
            </div>
            {touched && topic === null && (
              <p className="mt-1 text-xs text-red-600">{t("support.form.topicMissing")}</p>
            )}

            <label htmlFor="support-text" className="mt-4 block text-sm font-medium text-zinc-700">
              {t("support.form.describe")}
            </label>
            <textarea
              id="support-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => setTouched(true)}
              rows={4}
              minLength={SUPPORT_MIN_CHARS}
              maxLength={SUPPORT_MAX_CHARS}
              placeholder={t("support.form.placeholder")}
              className="mt-2 w-full rounded-lg border border-zinc-300 p-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
            {touched && !isDescriptionValid(text) && (
              <p className="mt-1 text-xs text-red-600">{t("support.form.min")}</p>
            )}

            <label htmlFor="support-email" className="mt-4 block text-sm font-medium text-zinc-700">
              {t("support.form.email")}
            </label>
            <input
              id="support-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="you@example.com"
              className="mt-2 w-full rounded-lg border border-zinc-300 p-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
            {touched && !isEmailValid(email) && (
              <p className="mt-1 text-xs text-red-600">{t("support.form.emailInvalid")}</p>
            )}

            <label htmlFor="support-shot" className="mt-4 block text-sm font-medium text-zinc-700">
              {t("support.form.screenshot")}
            </label>
            <input
              id="support-shot"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-xs text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-zinc-700"
            />
            {screenshotTooBig && (
              <p className="mt-1 text-xs text-red-600">{t("support.form.screenshotTooBig")}</p>
            )}

            {/* Honeypot for bots; hidden from players and screen readers. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            <p className="mt-3 text-xs text-zinc-500">{t("support.form.note")}</p>

            {status === "error" && (
              <p className="mt-3 text-xs text-red-600">
                {t("support.form.error")}{" "}
                <a href={fallbackHref} className="underline">
                  {t("support.form.fallback")}
                </a>
              </p>
            )}
            {status === "rate_limited" && (
              <p className="mt-3 text-xs text-red-600">{t("support.form.rateLimited")}</p>
            )}

            <button
              type="button"
              onClick={send}
              disabled={!valid || status === "sending"}
              className="mt-4 w-full rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {status === "sending" ? t("support.form.sending") : t("support.form.send")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
