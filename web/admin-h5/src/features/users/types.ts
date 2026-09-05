export interface PageData<T> {
  page: number;
  page_size: number;
  total: number;
  items: T[];
}

export interface User {
  id: number;
  username: string;
  display_name?: string;
  email?: string;
  role: number;
  status: number;
  group: string;
  quota: number;
  used_quota: number;
}

export interface UserDetail extends User {
  admin_permissions?: unknown;
}

export interface TopUp {
  id: number;
  user_id: number;
  amount: number;
  money: number;
  trade_no: string;
  payment_method: string;
  payment_provider: string;
  group_buy_id: number;
  agent_prepay_id: number;
  create_time: number;
  complete_time: number;
  status: string;
  held_quota: number;
}

export type QuotaMode = "add" | "subtract" | "override";

export interface AdjustQuotaPayload {
  id: number;
  action: "add_quota";
  value: number;
  mode: QuotaMode;
}

export interface UserQuery {
  page: number;
  pageSize: number;
  keyword: string;
  status: "" | "1" | "2";
  balance: "" | "negative";
}

/** @deprecated Use UserQuery instead. */
export type UserListQuery = UserQuery;

export const DEFAULT_PAGE_SIZE = 20;
export const TOP_UP_PAGE_SIZE = 10;

export function normalizeUserQuery(query: Partial<UserQuery>): UserQuery {
  const page =
    typeof query.page === "number" && Number.isInteger(query.page) && query.page > 0
      ? query.page
      : 1;
  const pageSize =
    typeof query.pageSize === "number" && Number.isInteger(query.pageSize) && query.pageSize > 0
      ? query.pageSize
      : DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize,
    keyword: typeof query.keyword === "string" ? query.keyword.trim() : "",
    status: query.status === "1" || query.status === "2" ? query.status : "",
    balance: query.balance === "negative" ? query.balance : "",
  };
}

/** @deprecated Use normalizeUserQuery instead. */
export const normalizeUserListQuery = normalizeUserQuery;
