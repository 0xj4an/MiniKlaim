import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_ENDS_AT,
  CAMPAIGN_URL,
  campaignIsOpen,
} from "@/lib/useCampaignBanner";

describe("campaignIsOpen", () => {
  it("is open during the contest", () => {
    expect(campaignIsOpen(Date.parse("2026-10-31T12:00:00Z"))).toBe(true);
  });

  it("closes itself once the contest ends", () => {
    // The point of the date: nobody has to remember to take the banner
    // down, so it cannot invite players to something that already ended.
    expect(campaignIsOpen(Date.parse("2026-11-25T00:00:01Z"))).toBe(false);
  });

  it("still counts the last day as open", () => {
    expect(campaignIsOpen(Date.parse("2026-11-24T23:00:00Z"))).toBe(true);
  });

  it("has a parseable end date and a real link", () => {
    expect(Number.isFinite(CAMPAIGN_ENDS_AT)).toBe(true);
    expect(CAMPAIGN_URL).toMatch(/^https:\/\/x\.com\//);
  });
});
