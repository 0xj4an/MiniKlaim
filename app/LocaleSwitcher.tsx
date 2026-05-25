"use client";

import { type Locale, useLocale } from "@/lib/i18n";

/**
 * Tiny language switcher that pins to the top-right of every page (mounted
 * in the root layout). Native `<select>` for accessibility and zero JS UI
 * overhead. Stays out of the way over maps and modals because the z-index
 * is low and it's positioned in a corner.
 */
export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <div
      className="pointer-events-none fixed top-3 right-3 z-30"
      style={{ paddingTop: "env(safe-area-inset-top, 0)" }}
    >
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label="Language"
        className="pointer-events-auto rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur hover:bg-white focus:border-zinc-400 focus:outline-none"
      >
        <option value="en">EN</option>
        <option value="es">ES</option>
      </select>
    </div>
  );
}
