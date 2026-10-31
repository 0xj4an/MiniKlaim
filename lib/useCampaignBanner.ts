"use client";

import { useEffect, useState } from "react";

/**
 * The #MiniPayInMyDay contest banner on the home screen.
 *
 * Celo Communities Guild runs it from 24 Oct to 24 Nov 2026: show how you
 * use MiniPay day to day and share 1000 CELO. MiniKlaim players are MiniPay
 * users almost by definition, so the overlap is the whole point.
 *
 * Two things keep this from rotting into the "Coming Soon / Rewards
 * Campaign" placeholder it replaces. It carries its own end date, so the
 * banner disappears on its own when the contest closes instead of inviting
 * people to something that ended; and the dismissal key carries the
 * campaign name, so the next campaign is not silenced by someone who
 * closed this one.
 */
const KEY = "miniklaim.seenCampaign.minipay-in-my-day";

/** Last moment the contest accepts entries (24 Nov 2026, end of day UTC). */
export const CAMPAIGN_ENDS_AT = Date.parse("2026-11-24T23:59:59Z");

export const CAMPAIGN_URL =
  "https://x.com/CeloCommunities/status/2113914307364995287";

/** True while the contest is still open. */
export function campaignIsOpen(now = Date.now()): boolean {
  return now <= CAMPAIGN_ENDS_AT;
}

export function useCampaignBanner(): {
  showCampaign: boolean;
  dismiss: () => void;
} {
  // Starts hidden: the server has no localStorage, so rendering the banner
  // during SSR and then removing it on the client is a hydration mismatch —
  // the same bug that cost /me a React #418 on every load (27 Oct 2026).
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      // Storage disabled or blocked: show it. A banner seen twice costs a
      // player nothing; one never seen costs them the contest.
    }
    queueMicrotask(() => setHidden(!!stored));
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // It comes back next visit, which is acceptable for a banner.
    }
    setHidden(true);
  };

  return { showCampaign: !hidden && campaignIsOpen(), dismiss };
}
