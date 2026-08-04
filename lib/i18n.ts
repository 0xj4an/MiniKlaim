"use client";

import { useSyncExternalStore } from "react";
import { dictionaries, type Locale, type TranslationKey } from "./i18nDict";

export type { Locale, TranslationKey };
export { dictionaries };

const LOCALE_KEY = "miniklaim.locale";
const LOCALE_COOKIE = "miniklaim.locale";

// Single shared locale state at module scope. Every useLocale() consumer reads
// from and subscribes to the same value, so a call to setLocale() in any
// component fans out to every mounted component. The previous implementation
// held locale in a per-hook useState, which meant the BottomNav toggle only
// updated BottomNav itself and left the other 20 screens stuck.
let currentLocale: Locale = "en";
let hydrated = false;
const listeners = new Set<() => void>();

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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Locale {
  return currentLocale;
}

// SSR and the very first client render always see "en" so the hydrated markup
// matches what the server sent. The real locale is picked up in a microtask
// after mount and broadcast via emit(), triggering a client-only re-render.
function getServerSnapshot(): Locale {
  return "en";
}

function emit(): void {
  for (const l of listeners) l();
}

function setLocaleShared(next: Locale): void {
  if (currentLocale === next && hydrated) return;
  currentLocale = next;
  hydrated = true;
  try {
    window.localStorage.setItem(LOCALE_KEY, next);
  } catch {
    // ignore quota
  }
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  emit();
}

if (typeof window !== "undefined") {
  // One-time hydration from storage/cookie/browser preference. Deferred to a
  // microtask so React can complete its hydration pass with the server value
  // ("en") first; the emit() then flips subscribers to the real locale.
  queueMicrotask(() => {
    if (hydrated) return;
    currentLocale = detectInitialLocale();
    hydrated = true;
    emit();
  });
}

export function useLocale(): {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TranslationKey) => string;
} {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    locale,
    setLocale: setLocaleShared,
    t: (key: TranslationKey) => dictionaries[locale][key],
  };
}
