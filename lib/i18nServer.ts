import { cookies, headers } from "next/headers";
import { dictionaries, type Locale, type TranslationKey } from "./i18nDict";

export async function serverLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("miniklaim.locale")?.value;
  if (cookieLocale === "en" || cookieLocale === "es") return cookieLocale;
  const h = await headers();
  const accept = h.get("accept-language") ?? "";
  return accept.toLowerCase().startsWith("es") ? "es" : "en";
}

export async function serverT(): Promise<{
  locale: Locale;
  t: (key: TranslationKey) => string;
}> {
  const locale = await serverLocale();
  return {
    locale,
    t: (key: TranslationKey) => dictionaries[locale][key],
  };
}
