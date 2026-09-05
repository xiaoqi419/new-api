import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getUsers, searchUsers } from "../api";
import { normalizeUserQuery, type UserQuery } from "../types";
import { useAuthStore } from "../../../stores/auth-store";

export function useUsers(input: Partial<UserQuery>) {
  const query = normalizeUserQuery(input);
  const { activeSiteId, sites } = useAuthStore();
  const generation = sites[activeSiteId].generation;
  const hasSearch = Boolean(query.keyword || query.status || query.balance);

  return useQuery({
    queryKey: [
      "site",
      activeSiteId,
      generation,
      "users",
      query.page,
      query.pageSize,
      query.keyword,
      query.status,
      query.balance,
    ],
    queryFn: ({ signal }) =>
      hasSearch ? searchUsers(query, { signal }) : getUsers(query, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
