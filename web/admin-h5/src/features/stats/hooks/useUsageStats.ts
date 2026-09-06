import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useAuthStore } from "../../../stores/auth-store";
import { getUsageStats } from "../api";
import { startOfLocalDay, statsRangeWindow, type StatsRange } from "../range";

export function useUsageStats(range: StatsRange) {
  const { activeSiteId, sites } = useAuthStore();
  const generation = sites[activeSiteId].generation;
  const dayKey = startOfLocalDay(new Date()).toDateString();

  return useQuery({
    queryKey: ["site", activeSiteId, generation, "usage-stats", range, dayKey],
    queryFn: ({ signal }) => {
      const window = statsRangeWindow(range);
      return getUsageStats(window.startTimestamp, window.endTimestamp, { signal });
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
