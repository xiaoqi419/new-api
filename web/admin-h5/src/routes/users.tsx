import type { ReactElement } from "react";

import { UserListPage } from "../features/users/components/UserListPage";

export type UsersSearch = {
  keyword?: string;
  status?: "1" | "2";
  balance?: "negative";
  page?: number;
};

function validPage(value: unknown): number | undefined {
  let page: number;
  if (typeof value === "number") {
    page = value;
  } else if (typeof value === "string") {
    page = Number(value);
  } else {
    page = Number.NaN;
  }
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

// This route module intentionally exports the search validator alongside its component.
// oxlint-disable-next-line react/only-export-components
export function validateUsersSearch(search: Record<string, unknown>): UsersSearch {
  const keyword = typeof search.keyword === "string" ? search.keyword.trim() : "";
  const status = search.status === "1" || search.status === "2" ? search.status : undefined;
  const balance = search.balance === "negative" ? search.balance : undefined;

  return {
    keyword: keyword || undefined,
    status,
    balance,
    page: validPage(search.page),
  };
}

export function UsersPage(): ReactElement {
  return <UserListPage />;
}
