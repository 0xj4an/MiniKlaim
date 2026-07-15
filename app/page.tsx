import { LogoWordmark } from "./Logo";
import { HomeClient } from "./HomeClient";
import { serverT } from "@/lib/i18nServer";

export default async function HomePage() {
  const { t } = await serverT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12 pb-24">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <LogoWordmark height={48} />
          <h1 className="text-3xl leading-tight font-bold text-zinc-900">
            {t("home.tagline")}
          </h1>
        </div>
        <HomeClient />
      </div>
    </main>
  );
}
