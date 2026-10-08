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
      className="min-h-11 rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
    >
      {"<- "}
      {t("common.back")}
    </button>
  );
}
