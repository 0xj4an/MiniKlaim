"use client";

import { useEffect, useState } from "react";

export type Locale = "en" | "es";

const LOCALE_KEY = "miniklaim.locale";

const dictionaries = {
  en: {
    "home.tagline": "Run the city. The blocks you cross are yours.",
    "home.stats.blocks": "blocks captured",
    "home.stats.player": "player",
    "home.stats.players": "players",
    "home.cta.signIn": "Sign in to play",
    "home.cta.signingIn": "Signing in...",
    "home.cta.switchChain": "Switch to Celo",
    "home.cta.switching": "Switching...",
    "home.cta.pickName": "Pick your name",
    "home.cta.start": "Start running",
    "home.cta.continue": "Keep running",
    "home.hey": "Hey",
    "nav.you": "You",
    "nav.community": "Community",
    "nav.help": "Help",
    "onboarding.title": "Welcome to MiniKlaim",
    "onboarding.step1.title": "Run anywhere",
    "onboarding.step1.body":
      "When you walk or run through a block on the map, that block becomes yours.",
    "onboarding.step2.title": "Pick your name",
    "onboarding.step2.body":
      "Choose a name so other players see you on the leaderboard.",
    "onboarding.step3.title": "Captura mas territorio",
    "onboarding.step3.body":
      "The more blocks you own, the higher you rank. Streaks count too.",
    "onboarding.next": "Next",
    "onboarding.start": "Got it",
    "common.loading": "Loading...",
    "locale.toggle": "Espanol",
  },
  es: {
    "home.tagline": "Corre la ciudad. Las cuadras que cruzas son tuyas.",
    "home.stats.blocks": "cuadras capturadas",
    "home.stats.player": "jugador",
    "home.stats.players": "jugadores",
    "home.cta.signIn": "Entra para jugar",
    "home.cta.signingIn": "Entrando...",
    "home.cta.switchChain": "Cambia a Celo",
    "home.cta.switching": "Cambiando...",
    "home.cta.pickName": "Elige tu nombre",
    "home.cta.start": "Empezar a correr",
    "home.cta.continue": "Seguir corriendo",
    "home.hey": "Hola",
    "nav.you": "Tu",
    "nav.community": "Comunidad",
    "nav.help": "Ayuda",
    "onboarding.title": "Bienvenido a MiniKlaim",
    "onboarding.step1.title": "Corre donde quieras",
    "onboarding.step1.body":
      "Cuando caminas o corres por una cuadra del mapa, esa cuadra es tuya.",
    "onboarding.step2.title": "Elige tu nombre",
    "onboarding.step2.body":
      "Pon un nombre para que otros jugadores te vean en la tabla.",
    "onboarding.step3.title": "Captura mas territorio",
    "onboarding.step3.body":
      "Mientras mas cuadras tengas, mas subes. Las rachas tambien cuentan.",
    "onboarding.next": "Siguiente",
    "onboarding.start": "Listo",
    "common.loading": "Cargando...",
    "locale.toggle": "English",
  },
} as const;

export type TranslationKey = keyof (typeof dictionaries)["en"];

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    // ignore
  }
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
  };

  const t = (key: TranslationKey): string => {
    const dict = dictionaries[mounted ? locale : "en"];
    return dict[key];
  };

  return { locale, setLocale, t };
}
