import { BADGE_IDS } from "@/lib/onchain/badges";

export type BadgeStats = {
  totalRuns: number;
  hexesOwned: number;
  bestRunHexes: number;
  bestRunDistance: number;
  lifetimeDistance: number;
  cityCount: number;
  conquests: number;
  countryCount: number;
  streak: number;
};

type Metric = keyof BadgeStats;

/**
 * Every stat-based badge: the figure it reads and the value it needs. One
 * table serves both eligibility and the progress shown on the challenge card,
 * so the two can never disagree. Order is the claim order.
 */
export const BADGE_RULES: ReadonlyArray<
  readonly [keyof typeof BADGE_IDS, Metric, number]
> = [
  ["firstSteps", "totalRuns", 1],
  ["iron", "totalRuns", 50],
  ["veteran", "totalRuns", 100],
  ["relentless", "totalRuns", 250],
  ["firstBlock", "hexesOwned", 1],
  ["fiveBlocks", "hexesOwned", 5],
  ["mayor", "hexesOwned", 20],
  ["hundred", "hexesOwned", 100],
  ["baron", "hexesOwned", 250],
  ["duke", "hexesOwned", 500],
  ["kingdom", "hexesOwned", 1000],
  ["bigRun", "bestRunHexes", 5],
  ["marathon", "bestRunDistance", 10000],
  ["halfMarathon", "bestRunDistance", 21000],
  ["fullMarathon", "bestRunDistance", 42000],
  ["pacer", "lifetimeDistance", 50000],
  ["roadrunner", "lifetimeDistance", 100000],
  ["ultra", "lifetimeDistance", 500000],
  ["firstCity", "cityCount", 1],
  ["explorer", "cityCount", 3],
  ["wanderer", "cityCount", 10],
  ["pioneer", "cityCount", 25],
  ["firstBlood", "conquests", 1],
  ["raider", "conquests", 25],
  ["warlord", "conquests", 100],
  ["firstCountry", "countryCount", 1],
  ["borderCrosser", "countryCount", 2],
  ["globetrotter", "countryCount", 5],
  ["worldCitizen", "countryCount", 10],
  ["continental", "countryCount", 25],
  ["planetary", "countryCount", 50],
  ["hemispheric", "countryCount", 100],
  ["worldwide", "countryCount", 195],
  ["empire", "hexesOwned", 2500],
  ["dominion", "hexesOwned", 10000],
  ["ironLegs", "lifetimeDistance", 1_000_000],
  ["earthstrider", "lifetimeDistance", 5_000_000],
  ["equator", "lifetimeDistance", 40_000_000],
  ["machine", "totalRuns", 500],
  ["legend", "totalRuns", 1000],
  ["cartographer", "cityCount", 50],
  ["atlas", "cityCount", 100],
  ["voyager", "cityCount", 250],
  ["odyssey", "cityCount", 500],
  ["worldwalker", "cityCount", 1000],
  ["conqueror", "conquests", 500],
  ["overlord", "conquests", 1000],
  ["threeDays", "streak", 3],
  ["oneWeek", "streak", 7],
  ["twoWeeks", "streak", 14],
  ["oneMonth", "streak", 30],
  ["twoMonths", "streak", 60],
  ["threeMonths", "streak", 90],
  ["sixMonths", "streak", 180],
  ["oneYear", "streak", 365],
];

/** Badge IDs these stats qualify for. */
export function eligibleFromStats(stats: BadgeStats): bigint[] {
  return BADGE_RULES.filter(([, m, need]) => stats[m] >= need).map(
    ([b]) => BADGE_IDS[b],
  );
}

export type BadgeProgress = {
  id: number;
  have: number;
  need: number;
  metric: Metric;
};

/**
 * Progress toward the given badges. Badges with no stat rule are left out.
 * `have` is capped at `need`; distances are in meters.
 */
export function badgeProgress(
  stats: BadgeStats,
  ids: number[],
): BadgeProgress[] {
  const out: BadgeProgress[] = [];
  for (const id of ids) {
    const rule = BADGE_RULES.find(([b]) => Number(BADGE_IDS[b]) === id);
    if (!rule) continue;
    const [, metric, need] = rule;
    out.push({ id, have: Math.min(stats[metric], need), need, metric });
  }
  return out;
}

