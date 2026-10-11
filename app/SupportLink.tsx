"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/supportMail";
import { useWallet } from "@/lib/wallet/useWallet";

/** Email link to support with subject and device details filled in. */
export function SupportLink({ className }: { className?: string }) {
  const { t, locale } = useLocale();
  const { address } = useWallet();
  // navigator only exists in the browser; render a plain link on the server.
  const [href, setHref] = useState(`mailto:${SUPPORT_EMAIL}`);
  const subject = t("support.subject");
  const prompt = t("support.body");
  useEffect(() => {
    setHref(
      supportMailto({
        subject,
        prompt,
        wallet: address,
        userAgent: navigator.userAgent,
        locale,
      }),
    );
  }, [address, locale, subject, prompt]);
  return (
    <a href={href} className={className}>
      {SUPPORT_EMAIL}
    </a>
  );
}
