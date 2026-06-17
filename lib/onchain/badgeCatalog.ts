import { badgeCopy } from "@/lib/onchain/badgeArt";

// Stats needed to evaluate which badges a player has unlocked. Both the owner
// view (/me, UserStats) and the public profile (/p, PublicProfile) satisfy it.
export type BadgeStats = {
  hexesOwned: number;
  totalRuns: number;
  bestRunHexes: number;
  bestRunDistanceMeters: number;
  streak: number;
  lifetimeDistanceMeters: number;
  cityCount: number;
  conquests: number;
  countryCount: number;
};

export type EvaluatedBadge = {
  onchainId: number;
  name: string;
  description: string;
  unlocked: boolean;
};

// Display groups follow the contiguous id ranges (see lib/onchain/badges.ts).
export const BADGE_GROUPS: { en: string; es: string; ids: number[] }[] = [
  { en: "Territory", es: "Territorio", ids: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { en: "Runs", es: "Corridas", ids: [10, 11, 12, 13, 14, 15] },
  { en: "Single run", es: "Una corrida", ids: [16, 17, 18, 19] },
  { en: "Distance", es: "Distancia", ids: [20, 21, 22, 23, 24, 25] },
  { en: "Streaks", es: "Rachas", ids: [26, 27, 28, 29, 30, 31, 32, 33] },
  { en: "Cities", es: "Ciudades", ids: [34, 35, 36, 37, 38, 39, 40, 41, 42] },
  { en: "Conquest", es: "Conquista", ids: [43, 44, 45, 46, 47] },
  { en: "Countries", es: "Paises", ids: [48, 49, 50, 51, 52, 53, 54, 55] },
];

/** Evaluate all 55 badges (id + localized copy + unlocked) for the given stats.
 *  Keep thresholds in sync with computeEligibleBadgeIds. */
export function evaluateBadges(
  s: BadgeStats,
  locale: "en" | "es",
): EvaluatedBadge[] {
  const defs: Array<[number, boolean]> = [
    // Territory.
    [1, s.hexesOwned >= 1],
    [2, s.hexesOwned >= 5],
    [3, s.hexesOwned >= 20],
    [4, s.hexesOwned >= 100],
    [5, s.hexesOwned >= 250],
    [6, s.hexesOwned >= 500],
    [7, s.hexesOwned >= 1000],
    [8, s.hexesOwned >= 2500],
    [9, s.hexesOwned >= 10000],
    // Runs.
    [10, s.totalRuns >= 1],
    [11, s.totalRuns >= 50],
    [12, s.totalRuns >= 100],
    [13, s.totalRuns >= 250],
    [14, s.totalRuns >= 500],
    [15, s.totalRuns >= 1000],
    // Single-run feats.
    [16, s.bestRunHexes >= 5],
    [17, s.bestRunDistanceMeters >= 10000],
    [18, s.bestRunDistanceMeters >= 21000],
    [19, s.bestRunDistanceMeters >= 42000],
    // Lifetime distance.
    [20, s.lifetimeDistanceMeters >= 50000],
    [21, s.lifetimeDistanceMeters >= 100000],
    [22, s.lifetimeDistanceMeters >= 500000],
    [23, s.lifetimeDistanceMeters >= 1000000],
    [24, s.lifetimeDistanceMeters >= 5000000],
    [25, s.lifetimeDistanceMeters >= 40000000],
    // Streaks.
    [26, s.streak >= 3],
    [27, s.streak >= 7],
    [28, s.streak >= 14],
    [29, s.streak >= 30],
    [30, s.streak >= 60],
    [31, s.streak >= 90],
    [32, s.streak >= 180],
    [33, s.streak >= 365],
    // Cities.
    [34, s.cityCount >= 1],
    [35, s.cityCount >= 3],
    [36, s.cityCount >= 10],
    [37, s.cityCount >= 25],
    [38, s.cityCount >= 50],
    [39, s.cityCount >= 100],
    [40, s.cityCount >= 250],
    [41, s.cityCount >= 500],
    [42, s.cityCount >= 1000],
    // Conquest.
    [43, s.conquests >= 1],
    [44, s.conquests >= 25],
    [45, s.conquests >= 100],
    [46, s.conquests >= 500],
    [47, s.conquests >= 1000],
    // Countries.
    [48, s.countryCount >= 1],
    [49, s.countryCount >= 2],
    [50, s.countryCount >= 5],
    [51, s.countryCount >= 10],
    [52, s.countryCount >= 25],
    [53, s.countryCount >= 50],
    [54, s.countryCount >= 100],
    [55, s.countryCount >= 195],
  ];
  return defs.map(([onchainId, unlocked]) => {
    const c = badgeCopy(onchainId, locale);
    return { onchainId, name: c.name, description: c.description, unlocked };
  });
}
