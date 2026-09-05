import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getUser, getUserTopUps } from "../api";
import { TOP_UP_PAGE_SIZE } from "../types";
import { useAuthStore } from "../../../stores/auth-store";

export function useUserDetail(userId: number | null) {
  const { activeSiteId, sites } = useAuthStore();
  const generation = sites[activeSiteId].generation;
  return useQuery({
    queryKey: ["site", activeSiteId, generation, "user-detail", userId],
    queryFn: ({ signal }) => getUser(userId as number, { signal }),
    enabled: userId !== null,
    staleTime: 30_000,
  });
}

export function useUserTopUps(userId: number | null, page: number) {
  const { activeSiteId, sites } = useAuthStore();
  const generation = sites[activeSiteId].generation;
  return useQuery({
    queryKey: ["site", activeSiteId, generation, "user-topups", userId, page, TOP_UP_PAGE_SIZE],
    queryFn: ({ signal }) => getUserTopUps(userId as number, page, { signal }),
    enabled: userId !== null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
