export const USAGE_DISPLAY_MULTIPLIER = 2.5;

export const STATS_RANGES = ["today", "yesterday", "7d", "30d"] as const;

export type StatsRange = (typeof STATS_RANGES)[number];

export function isStatsRange(value: unknown): value is StatsRange {
  return value === "today" || value === "yesterday" || value === "7d" || value === "30d";
}

export type StatsSearch = {
  range?: StatsRange;
};

export function validateStatsSearch(search: Record<string, unknown>): StatsSearch {
  return {
    range: isStatsRange(search.range) ? search.range : undefined,
  };
}

export function startOfLocalDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function statsRangeWindow(
  range: StatsRange,
  now = new Date(),
): { startTimestamp: number; endTimestamp: number } {
  const endTimestamp = Math.floor(now.getTime() / 1000);
  const todayStart = startOfLocalDay(now);

  if (range === "today") {
    return { startTimestamp: Math.floor(todayStart.getTime() / 1000), endTimestamp };
  }

  if (range === "yesterday") {
    const yesterdayStart = startOfLocalDay(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    return {
      startTimestamp: Math.floor(yesterdayStart.getTime() / 1000),
      endTimestamp: Math.floor(todayStart.getTime() / 1000) - 1,
    };
  }

  const windowStart = startOfLocalDay(now);
  const daysBack = range === "7d" ? 6 : 29;
  windowStart.setDate(windowStart.getDate() - daysBack);
  return { startTimestamp: Math.floor(windowStart.getTime() / 1000), endTimestamp };
}

export function applyDisplayMultiplier(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value * USAGE_DISPLAY_MULTIPLIER;
}
