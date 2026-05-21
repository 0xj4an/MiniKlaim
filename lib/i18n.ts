"use client";

import { useEffect, useState } from "react";
import { dictionaries, type Locale, type TranslationKey } from "./i18nDict";

export type { Locale, TranslationKey };
export { dictionaries };

const LOCALE_KEY = "miniklaim.locale";
const LOCALE_COOKIE = "miniklaim.locale";

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    // ignore
  }
  const match = document.cookie.match(/(?:^|;\s*)miniklaim\.locale=(en|es)/);
  if (match) return match[1] as Locale;
  const browser = navigator.language?.toLowerCase() ?? "";
  return browser.startsWith("es") ? "es" : "en";
}

export function useLocale(): {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TranslationKey) => string;
} {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = detectInitialLocale();
    queueMicrotask(() => {
      setLocaleState(initial);
      setMounted(true);
    });
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // ignore quota
    }
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  };

  const t = (key: TranslationKey): string => {
    const dict = dictionaries[mounted ? locale : "en"];
    return dict[key];
  };

  return { locale, setLocale, t };
}
