"use client";

import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { CAMPAIGN_URL, useCampaignBanner } from "@/lib/useCampaignBanner";

/**
 * Invites players to the #MiniPayInMyDay contest, in place of the
 * "Coming Soon / Rewards Campaign" placeholder that sat here before.
 *
 * It is a link, not a modal: the first thing a player wants on the home
 * screen is the Capture button, and a contest that interrupts that costs
 * more than it brings in. The prize is in the copy because "a campaign" is
 * not a reason to tap and "1000 CELO" is.
 */
export function CampaignBanner() {
  const { showCampaign, dismiss } = useCampaignBanner();
  const { t } = useLocale();
  if (!showCampaign) return null;
  return (
    <div className="relative w-full rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 p-[2px] shadow-lg">
      <a
        href={CAMPAIGN_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("campaign_banner_clicked", { campaign: "minipay_in_my_day" })}
        className="flex items-center gap-3 rounded-[10px] bg-white px-4 py-3 pr-9 text-left"
      >
        <span className="text-2xl" aria-hidden>
          🎬
        </span>
        <span className="flex flex-col">
          <span className="text-xs font-semibold tracking-wide text-orange-600 uppercase">
            {t("campaign.tag")}
          </span>
          <span className="text-sm font-bold text-zinc-900">
            {t("campaign.title")}
          </span>
          <span className="text-xs text-zinc-500">{t("campaign.until")}</span>
        </span>
      </a>
      <button
        type="button"
        aria-label={t("campaign.close")}
        onClick={() => {
          track("campaign_banner_dismissed", { campaign: "minipay_in_my_day" });
          dismiss();
        }}
        className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
      >
        <span aria-hidden>×</span>
      </button>
    </div>
  );
}
