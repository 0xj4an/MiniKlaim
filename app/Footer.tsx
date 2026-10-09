import Link from "next/link";
import { useLocale } from "@/lib/i18n";

export function Footer() {
  const { t } = useLocale();
  
  return (
    <footer className="mt-8 flex flex-col gap-2 border-t border-zinc-200 pt-6 text-xs text-zinc-500">
      <div className="flex gap-4">
        <Link href="/stats" className="underline hover:text-zinc-600">
          {t("about.footer.stats")}
        </Link>
        <Link href="/privacy" className="underline hover:text-zinc-600">
          {t("about.footer.privacy")}
        </Link>
        <Link href="/terms" className="underline hover:text-zinc-600">
          {t("about.footer.terms")}
        </Link>
      </div>
      <p>{t("about.footer.disclaimer")}</p>
    </footer>
  );
}
