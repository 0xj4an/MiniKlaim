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
    "onboarding.step3.title": "Capture more territory",
    "onboarding.step3.body":
      "The more blocks you own, the higher you rank. Streaks count too.",
    "onboarding.next": "Next",
    "onboarding.start": "Got it",
    "common.loading": "Loading...",
    "common.home": "Home",
    "locale.toggle": "Espanol",
    "me.title": "You",
    "me.refresh": "Refresh",
    "me.signInPrompt.before": "Sign in on the",
    "me.signInPrompt.link": "home page",
    "me.signInPrompt.after": "to see your stats.",
    "me.stat.blocks": "blocks",
    "me.stat.runs": "runs",
    "me.stat.dayStreak": "day streak",
    "me.stat.daysStreak": "days streak",
    "me.bestRun.label": "Best run:",
    "me.bestRun.suffix": "blocks",
    "me.rank.before": "You're",
    "me.rank.after": "worldwide",
    "me.badges.header": "Badges",
    "me.badges.of": "of",
    "me.badges.toast": "Badge unlocked:",
    "me.runs.header": "Your runs",
    "me.runs.block": "block",
    "me.runs.blocks": "blocks",
    "me.runs.running": "running",
    "me.money.header": "Your money",
    "me.signOut": "Sign out",
    "me.username.pick": "Pick a name. This is how people will see you.",
    "me.username.change": "Change your name",
    "me.username.placeholder": "your name",
    "me.username.save": "Save",
    "me.username.saving": "Saving...",
    "me.username.cancel": "cancel",
    "me.username.edit": "change name",
    "me.share.copied": "copied",
    "me.share.button": "share profile",
    "me.territory.header": "Your territory",
    "me.territory.empty":
      "You haven't captured any blocks yet. Start running to claim your first.",
    "badge.firstSteps.name": "First steps",
    "badge.firstSteps.desc": "Finish your first run",
    "badge.fiveBlocks.name": "Five blocks",
    "badge.fiveBlocks.desc": "Own 5 blocks",
    "badge.mayor.name": "Mayor",
    "badge.mayor.desc": "Own 20 blocks",
    "badge.hundred.name": "Hundred",
    "badge.hundred.desc": "Own 100 blocks",
    "badge.threeDays.name": "Three days",
    "badge.threeDays.desc": "3 days in a row",
    "badge.oneWeek.name": "One week",
    "badge.oneWeek.desc": "7 days in a row",
    "badge.twoWeeks.name": "Two weeks",
    "badge.twoWeeks.desc": "14 days in a row",
    "badge.bigRun.name": "Big run",
    "badge.bigRun.desc": "5 blocks in one run",
    "badge.marathon.name": "Marathon",
    "badge.marathon.desc": "10 km in one run",
    "badge.iron.name": "Iron",
    "badge.iron.desc": "Finish 50 runs",
    "community.title": "Community",
    "community.stat.blocksCaptured": "blocks captured",
    "community.stat.player": "player",
    "community.stat.players": "players",
    "community.leaderboard.header": "Top players",
    "community.activity.header": "Latest runs",
    "community.block": "block",
    "community.blocks": "blocks",
    "community.worldmap.header": "World map",
    "community.worldmap.captured": "captured",
    "community.popup.capturedBy": "Captured by",
    "community.popup.you": "(you)",
    "time.agoPrefix": "",
    "time.agoSuffix": " ago",
    "time.unit.seconds": "s",
    "time.unit.minutes": "m",
    "time.unit.hours": "h",
    "time.unit.days": "d",
    "run.gps.waiting": "Waiting for GPS...",
    "run.gps.denied":
      "Location denied. Enable it in browser settings to track runs.",
    "run.gps.unavailable": "Location unavailable on this device.",
    "run.start.signIn": "Sign in first",
    "run.start.starting": "Starting...",
    "run.start.button": "Start",
    "run.finish.finishing": "Finishing...",
    "run.finish.button": "Finish",
    "run.needName.kicker": "One more thing",
    "run.needName.body": "Pick a name so people know it's you on the map.",
    "run.needName.cta": "Pick your name",
    "run.summary.header": "Run complete",
    "run.summary.time": "Time",
    "run.summary.blocks": "Blocks",
    "run.summary.dist": "Dist",
    "run.summary.pace": "Pace /km",
    "run.summary.share": "Share",
    "run.summary.done": "Done",
    "run.banner.block": "block",
    "run.banner.blocks": "blocks",
    "run.popup.capturedBy": "Captured by",
    "run.popup.you": "(you)",
    "run.share.text.one": "Just captured 1 block",
    "run.share.text.many": "Just captured {n} blocks",
    "run.share.text.suffix": "on MiniKlaim.",
    "run.share.text.run": "run.",
    "about.title": "Help",
    "about.howTo.header": "How to play",
    "about.howTo.step1": "Sign in with your wallet on the home page.",
    "about.howTo.step2": "Pick a name on the You page.",
    "about.howTo.step3.before": "Tap",
    "about.howTo.step3.cta": "Start running",
    "about.howTo.step3.after": "on the home page.",
    "about.howTo.step4":
      "Walk or run outside. Every block you cross becomes yours on the map.",
    "about.howTo.step5.before": "Tap",
    "about.howTo.step5.cta": "Finish",
    "about.howTo.step5.after":
      "to end your run. Your blocks stay yours until someone else runs through them.",
    "about.faq.header": "Common questions",
    "about.faq.q1": "Do I lose blocks if someone else runs through them?",
    "about.faq.a1":
      "Yes. The block goes to whoever ran through last. So keep running to keep your turf.",
    "about.faq.q2": "Does it cost anything?",
    "about.faq.a2": "No. Playing is free. We don't charge fees.",
    "about.faq.q3": "Why a wallet?",
    "about.faq.a3":
      "It's how we keep your name and blocks attached to you across devices. We never see your password or your money.",
    "about.faq.q4": "Is this safe?",
    "about.faq.a4":
      "Don't run while staring at your phone. Don't run in dangerous places just to grab a block. The street is more important than the map.",
    "about.contact.header": "Get in touch",
    "about.contact.body": "Bugs, ideas, anything else:",
    "about.contact.handle": "@0xj4an on X",
    "about.footer.stats": "Stats",
    "about.footer.privacy": "Privacy",
    "about.footer.terms": "Terms",
    "about.footer.disclaimer":
      "MiniKlaim is a hobby project. Use at your own risk. No warranty.",
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
    "common.home": "Inicio",
    "locale.toggle": "English",
    "me.title": "Tu",
    "me.refresh": "Actualizar",
    "me.signInPrompt.before": "Entra desde la",
    "me.signInPrompt.link": "pagina de inicio",
    "me.signInPrompt.after": "para ver tus estadisticas.",
    "me.stat.blocks": "cuadras",
    "me.stat.runs": "corridas",
    "me.stat.dayStreak": "dia de racha",
    "me.stat.daysStreak": "dias de racha",
    "me.bestRun.label": "Mejor corrida:",
    "me.bestRun.suffix": "cuadras",
    "me.rank.before": "Eres el",
    "me.rank.after": "del mundo",
    "me.badges.header": "Insignias",
    "me.badges.of": "de",
    "me.badges.toast": "Insignia desbloqueada:",
    "me.runs.header": "Tus corridas",
    "me.runs.block": "cuadra",
    "me.runs.blocks": "cuadras",
    "me.runs.running": "corriendo",
    "me.money.header": "Tu plata",
    "me.signOut": "Cerrar sesion",
    "me.username.pick": "Elige un nombre. Asi te veran los demas jugadores.",
    "me.username.change": "Cambia tu nombre",
    "me.username.placeholder": "tu nombre",
    "me.username.save": "Guardar",
    "me.username.saving": "Guardando...",
    "me.username.cancel": "cancelar",
    "me.username.edit": "cambiar nombre",
    "me.share.copied": "copiado",
    "me.share.button": "compartir perfil",
    "me.territory.header": "Tu territorio",
    "me.territory.empty":
      "Aun no has capturado ninguna cuadra. Empieza a correr para reclamar la primera.",
    "badge.firstSteps.name": "Primeros pasos",
    "badge.firstSteps.desc": "Termina tu primera corrida",
    "badge.fiveBlocks.name": "Cinco cuadras",
    "badge.fiveBlocks.desc": "Posee 5 cuadras",
    "badge.mayor.name": "Alcalde",
    "badge.mayor.desc": "Posee 20 cuadras",
    "badge.hundred.name": "Centenario",
    "badge.hundred.desc": "Posee 100 cuadras",
    "badge.threeDays.name": "Tres dias",
    "badge.threeDays.desc": "3 dias seguidos",
    "badge.oneWeek.name": "Una semana",
    "badge.oneWeek.desc": "7 dias seguidos",
    "badge.twoWeeks.name": "Dos semanas",
    "badge.twoWeeks.desc": "14 dias seguidos",
    "badge.bigRun.name": "Gran corrida",
    "badge.bigRun.desc": "5 cuadras en una corrida",
    "badge.marathon.name": "Maraton",
    "badge.marathon.desc": "10 km en una corrida",
    "badge.iron.name": "Hierro",
    "badge.iron.desc": "Termina 50 corridas",
    "community.title": "Comunidad",
    "community.stat.blocksCaptured": "cuadras capturadas",
    "community.stat.player": "jugador",
    "community.stat.players": "jugadores",
    "community.leaderboard.header": "Mejores jugadores",
    "community.activity.header": "Ultimas corridas",
    "community.block": "cuadra",
    "community.blocks": "cuadras",
    "community.worldmap.header": "Mapa del mundo",
    "community.worldmap.captured": "capturadas",
    "community.popup.capturedBy": "Capturada por",
    "community.popup.you": "(tu)",
    "time.agoPrefix": "hace ",
    "time.agoSuffix": "",
    "time.unit.seconds": "s",
    "time.unit.minutes": "m",
    "time.unit.hours": "h",
    "time.unit.days": "d",
    "run.gps.waiting": "Esperando GPS...",
    "run.gps.denied":
      "Ubicacion denegada. Activala en los ajustes del navegador para correr.",
    "run.gps.unavailable": "Ubicacion no disponible en este dispositivo.",
    "run.start.signIn": "Entra primero",
    "run.start.starting": "Empezando...",
    "run.start.button": "Empezar",
    "run.finish.finishing": "Terminando...",
    "run.finish.button": "Terminar",
    "run.needName.kicker": "Una cosa mas",
    "run.needName.body":
      "Elige un nombre para que te reconozcan en el mapa.",
    "run.needName.cta": "Elige tu nombre",
    "run.summary.header": "Corrida terminada",
    "run.summary.time": "Tiempo",
    "run.summary.blocks": "Cuadras",
    "run.summary.dist": "Dist",
    "run.summary.pace": "Ritmo /km",
    "run.summary.share": "Compartir",
    "run.summary.done": "Listo",
    "run.banner.block": "cuadra",
    "run.banner.blocks": "cuadras",
    "run.popup.capturedBy": "Capturada por",
    "run.popup.you": "(tu)",
    "run.share.text.one": "Acabo de capturar 1 cuadra",
    "run.share.text.many": "Acabo de capturar {n} cuadras",
    "run.share.text.suffix": "en MiniKlaim.",
    "run.share.text.run": "de corrida.",
    "about.title": "Ayuda",
    "about.howTo.header": "Como jugar",
    "about.howTo.step1": "Entra con tu wallet desde la pagina de inicio.",
    "about.howTo.step2": "Elige un nombre en la pagina Tu.",
    "about.howTo.step3.before": "Toca",
    "about.howTo.step3.cta": "Empezar a correr",
    "about.howTo.step3.after": "en la pagina de inicio.",
    "about.howTo.step4":
      "Camina o corre afuera. Cada cuadra que cruzas se vuelve tuya en el mapa.",
    "about.howTo.step5.before": "Toca",
    "about.howTo.step5.cta": "Terminar",
    "about.howTo.step5.after":
      "para acabar la corrida. Tus cuadras siguen siendo tuyas hasta que otra persona corra por ellas.",
    "about.faq.header": "Preguntas comunes",
    "about.faq.q1": "Si alguien corre por mis cuadras, las pierdo?",
    "about.faq.a1":
      "Si. La cuadra se la lleva quien paso por ultimo. Sigue corriendo para no perder tu territorio.",
    "about.faq.q2": "Cuesta algo?",
    "about.faq.a2": "No. Jugar es gratis. No cobramos.",
    "about.faq.q3": "Por que pide una wallet?",
    "about.faq.a3":
      "Es la forma de que tu nombre y tus cuadras te sigan en cualquier dispositivo. Nunca vemos tu contrasena ni tu plata.",
    "about.faq.q4": "Es seguro?",
    "about.faq.a4":
      "No corras mirando el celular. No corras a sitios peligrosos solo por agarrar una cuadra. La calle vale mas que el mapa.",
    "about.contact.header": "Contacto",
    "about.contact.body": "Errores, ideas, lo que sea:",
    "about.contact.handle": "@0xj4an en X",
    "about.footer.stats": "Estadisticas",
    "about.footer.privacy": "Privacidad",
    "about.footer.terms": "Terminos",
    "about.footer.disclaimer":
      "MiniKlaim es un proyecto personal. Usalo bajo tu propio riesgo. Sin garantia.",
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
