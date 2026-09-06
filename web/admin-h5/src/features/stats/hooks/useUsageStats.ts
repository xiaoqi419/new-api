import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "../../../stores/auth-store";
import { getUsageStats } from "../api";
import { startOfLocalDay, STATS_RANGES, statsRangeWindow, type StatsRange } from "../range";

export function useUsageStats(range: StatsRange) {
  const queryClient = useQueryClient();
  const { activeSiteId, sites } = useAuthStore();
  const generation = sites[activeSiteId].generation;
  const dayKey = startOfLocalDay(new Date()).toDateString();

  useEffect(() => {
    for (const next of STATS_RANGES) {
      if (next === range) continue;
      const window = statsRangeWindow(next);
      void queryClient.prefetchQuery({
        queryKey: ["site", activeSiteId, generation, "usage-stats", next, dayKey],
        queryFn: ({ signal }) =>
          getUsageStats(window.startTimestamp, window.endTimestamp, { signal }),
        staleTime: 30_000,
      });
    }
  }, [activeSiteId, dayKey, generation, queryClient, range]);

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
