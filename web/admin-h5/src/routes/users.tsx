import type { ReactElement } from "react";

import { UserListPage } from "../features/users/components/UserListPage";

export type UsersSearch = {
  keyword?: string;
  status?: "1" | "2";
  balance?: "negative";
  page?: number;
};

function validPage(value: unknown): number | undefined {
  const page = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

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
