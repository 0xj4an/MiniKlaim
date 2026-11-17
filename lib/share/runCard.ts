import countries from "i18n-iso-countries";
import { fetchOwnApi } from "@/lib/server/ownApi";

/** What /api/runs/[id]/summary returns. */
export type RunCard = {
  id: string;
  username: string | null;
  hexesClaimed: number;
  distanceMeters: number;
  durationSec: number;
  moveMode: string | null;
  city: string | null;
  country: string | null;
  h3Ids: string[];
};

export async function fetchRunCard(id: string): Promise<RunCard | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await fetchOwnApi(`/api/runs/${id}/summary`);
  if (!res.ok) return null;
  return (await res.json()) as RunCard;
}

/** "187 m", "1.31 km", or "256.7 km" once the hundredths stop mattering. */
export function distanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toFixed(km >= 100 ? 1 : 2)} km`;
}

/** "25:25", or "1:05:09" past the hour. */
export function durationLabel(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (v: number) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/**
 * Average speed, "59.7 km/h", or "" for a run too short for the figure to
 * mean anything (6 m in 5 s is "4.3 km/h").
 */
export function speedLabel(card: Pick<RunCard, "durationSec" | "distanceMeters">): string {
  if (card.distanceMeters < 100 || card.durationSec < 30) return "";
  const kmh = (card.distanceMeters / card.durationSec) * 3.6;
  return `${kmh >= 100 ? Math.round(kmh) : kmh.toFixed(1)} km/h`;
}

/** "25:25 - 1.31 km", or just the time for a block captured standing still. */
export function statsLine(card: Pick<RunCard, "durationSec" | "distanceMeters">): string {
  return card.distanceMeters > 0
    ? `${durationLabel(card.durationSec)} - ${distanceLabel(card.distanceMeters)}`
    : durationLabel(card.durationSec);
}

/**
 * "Lagos, Nigeria". The database keeps the country as an ISO-3 code, which
 * reads as jargon on a card ("NGA"); the name comes from the runtime's own
 * region names, so no country list ships with the page.
 */
export function placeLabel(
  city: string | null,
  country: string | null,
  locale: "en" | "es" = "en",
): string {
  let name: string | null = country;
  if (country && country.length === 3) {
    const iso2 = countries.alpha3ToAlpha2(country);
    if (iso2) {
      try {
        name = new Intl.DisplayNames([locale], { type: "region" }).of(iso2) ?? country;
      } catch {
        name = country;
      }
    }
  }
  return [city, name].filter(Boolean).join(", ");
}
