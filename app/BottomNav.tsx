"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type TranslationKey, useLocale } from "@/lib/i18n";

type Tab = {
  href: string;
  key: TranslationKey;
  Icon: (props: { className?: string }) => React.JSX.Element;
};

const TABS: Tab[] = [
  { href: "/me", key: "nav.you", Icon: PersonIcon },
  { href: "/community", key: "nav.community", Icon: UsersIcon },
  { href: "/about", key: "nav.help", Icon: HelpIcon },
  { href: "/stats", key: "nav.stats", Icon: ChartIcon },
];

/**
 * Persistent bottom tab bar mounted in the root layout. Hidden on `/run`
 * where the fullscreen map already claims the bottom area for the
 * Start/Finish button. Each tab is a min 44x44 tap target, uses a
 * translated label, and highlights the current route. Renders `bottom-0`
 * with safe-area inset so it clears the iOS home indicator.
 *
 * Pages that show the tab bar must reserve room via `pb-20` (or equivalent)
 * on their main container so content is not clipped by the bar.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();

  if (pathname === "/run") return null;

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-2xl items-stretch">
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.href ||
            (tab.href !== "/" && pathname?.startsWith(`${tab.href}/`));
          const { Icon } = tab;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium tracking-wide uppercase transition-colors ${
                isActive
                  ? "text-orange-700"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-6 w-6" />
              <span>{t(tab.key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function HelpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
