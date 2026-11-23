"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";

export function BackButton() {
  const router = useRouter();
  const { t } = useLocale();
  return (
    <button
      type="button"
      data-back="history"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push("/");
      }}
      className="min-h-11 mk-tile px-3 py-1.5 text-sm font-semibold text-zinc-900"
    >
      {"<- "}
      {t("common.back")}
    </button>
  );
}
