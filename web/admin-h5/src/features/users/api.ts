import { isAxiosError, type AxiosRequestConfig } from "axios";

import { apiClient } from "../../lib/api-client";
import type { ApiResponse } from "../auth/types";
import {
  normalizeUserQuery,
  TOP_UP_PAGE_SIZE,
  type AdjustQuotaPayload,
  type PageData,
  type TopUp,
  type User,
  type UserDetail,
  type UserQuery,
} from "./types";

type UserRequestConfig = Pick<AxiosRequestConfig, "signal">;

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

export function isUserNotFoundError(error: unknown): error is UserNotFoundError {
  return error instanceof UserNotFoundError;
}

function isNotFoundMessage(message: string): boolean {
  return /(?:record|user)\s+not\s+found/i.test(message);
}

function pageParams(query: UserQuery): Record<string, number | string> {
  return { p: query.page, page_size: query.pageSize };
}

function readApiData<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === undefined) {
    const message = typeof response.message === "string" ? response.message.trim() : "";
    throw new Error(message);
  }
  return response.data;
}

function axiosResponseMessage(error: unknown): string {
  if (!isAxiosError(error)) return "";
  const data = error.response?.data;
  if (typeof data !== "object" || data === null) return "";
  const message = (data as { message?: unknown }).message;
  return typeof message === "string" ? message.trim() : "";
}

export function parsePositiveUserId(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function getUser(id: number, config?: UserRequestConfig): Promise<UserDetail> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid user id");

  try {
    const response = await apiClient.get<ApiResponse<UserDetail>>(`/api/user/${id}`, config);
    return readApiData(response.data);
  } catch (error) {
    if (
      (error instanceof Error && isNotFoundMessage(error.message)) ||
      (isAxiosError(error) && error.response?.status === 404)
    ) {
      throw new UserNotFoundError();
    }
    throw error;
  }
}

export async function getUserTopUps(
  userId: number,
  page = 1,
  config?: UserRequestConfig,
): Promise<PageData<TopUp>> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Invalid user id");
  if (!Number.isSafeInteger(page) || page <= 0) throw new Error("Invalid page");

  const response = await apiClient.get<ApiResponse<PageData<TopUp>>>("/api/user/topup", {
    ...config,
    params: { user_id: userId, p: page, page_size: TOP_UP_PAGE_SIZE },
  });
  const data = readApiData(response.data);
  const items = data.items.filter((topUp) => topUp.user_id === userId);
  if (items.length === data.items.length) return data;

  // Keep cross-user records out of the UI if an older backend ignores user_id.
  return { ...data, items, total: items.length };
}

export async function getUsers(
  input: Partial<UserQuery> = {},
  config?: UserRequestConfig,
): Promise<PageData<User>> {
  const query = normalizeUserQuery(input);
  const response = await apiClient.get<ApiResponse<PageData<User>>>("/api/user/", {
    ...config,
    params: pageParams(query),
  });
  return readApiData(response.data);
}

export async function searchUsers(
  input: Partial<UserQuery> = {},
  config?: UserRequestConfig,
): Promise<PageData<User>> {
  const query = normalizeUserQuery(input);
  const params: Record<string, number | string> = pageParams(query);
  if (query.keyword) params.keyword = query.keyword;
  if (query.status) params.status = query.status;
  if (query.balance) params.balance = query.balance;

  const response = await apiClient.get<ApiResponse<PageData<User>>>("/api/user/search", {
    ...config,
    params,
  });
  return readApiData(response.data);
}

export async function adjustQuota(
  payload: AdjustQuotaPayload,
  config?: UserRequestConfig,
): Promise<void> {
  try {
    const response = await apiClient.post<ApiResponse<unknown>>(
      "/api/user/manage",
      payload,
      config,
    );
    if (!response.data.success) {
      const message = typeof response.data.message === "string" ? response.data.message.trim() : "";
      throw new Error(message);
    }
  } catch (error) {
    if (isAxiosError(error)) throw new Error(axiosResponseMessage(error));
    throw error;
  }
}
