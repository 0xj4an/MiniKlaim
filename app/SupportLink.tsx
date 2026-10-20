"use client";

import { useState } from "react";
import { CloseButton } from "@/app/CloseButton";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18nDict";
import {
  isDescriptionValid,
  SUPPORT_EMAIL,
  SUPPORT_MIN_CHARS,
  SUPPORT_TOPICS,
  type SupportTopic,
  supportMailto,
} from "@/lib/supportMail";
import { useWallet } from "@/lib/wallet/useWallet";

/**
 * Contact support. Opens a short form first (topic + a required description)
 * and only then the player's email app, with the description, wallet, device
 * and app version in the body. A bare mailto let players send the template
 * untouched, so most support mail arrived empty.
 */
export function SupportLink({
  className,
  label,
}: {
  className?: string;
  /** Link text; defaults to the support address. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          track("support_form_opened", {});
          setOpen(true);
        }}
      >
        {label ?? SUPPORT_EMAIL}
      </a>
      {open && <SupportForm onClose={() => setOpen(false)} />}
    </>
  );
}

function SupportForm({ onClose }: { onClose: () => void }) {
  const { t, locale } = useLocale();
  const { address } = useWallet();
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const valid = topic !== null && isDescriptionValid(text);

  function send() {
    setTouched(true);
    if (!valid || !topic) return;
    track("support_mail_opened", { topic, chars: text.trim().length });
    window.location.href = supportMailto({
      subject: t("support.subject"),
      prompt: t("support.body"),
      description: text,
      topicLabel: t(`support.topic.${topic}` as TranslationKey),
      wallet: address,
      userAgent: navigator.userAgent,
      locale,
    });
    onClose();
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
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CloseButton onClick={onClose} className="absolute top-3 right-3" />
        <p id="support-form-title" className="pr-8 text-base font-bold text-zinc-900">
          {t("support.form.title")}
        </p>

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
          placeholder={t("support.form.placeholder")}
          className="mt-2 w-full rounded-lg border border-zinc-300 p-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
        />
        {touched && !isDescriptionValid(text) && (
          <p className="mt-1 text-xs text-red-600">{t("support.form.min")}</p>
        )}

        <p className="mt-3 text-xs text-zinc-500">{t("support.form.note")}</p>
        <button
          type="button"
          onClick={send}
          disabled={!valid}
          className="mt-4 w-full rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {t("support.form.send")}
        </button>
      </div>
    </div>
  );
}
