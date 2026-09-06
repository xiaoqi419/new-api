import { apiClient } from "../../lib/api-client";
import type { ApiResponse } from "../auth/types";
import type { QuotaDataPoint, UsageStatTotals, UsageStatsSnapshot } from "./types";

function readApiData<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === undefined) {
    const message = typeof response.message === "string" ? response.message.trim() : "";
    throw new Error(message || "Failed to load usage stats");
  }
  return response.data;
}

function asFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function groupQuotaDataByDay(points: QuotaDataPoint[]): UsageStatsSnapshot["days"] {
  const buckets = new Map<string, { count: number; quota: number; tokenUsed: number }>();
  for (const point of points) {
    const createdAt = asFiniteNumber(point.created_at);
    const day = new Date(createdAt * 1000).toLocaleDateString();
    const current = buckets.get(day) ?? { count: 0, quota: 0, tokenUsed: 0 };
    current.count += asFiniteNumber(point.count);
    current.quota += asFiniteNumber(point.quota);
    current.tokenUsed += asFiniteNumber(point.token_used);
    buckets.set(day, current);
  }
  return [...buckets.entries()]
    .map(([day, values]) => ({ day, ...values }))
    .sort((left, right) => left.day.localeCompare(right.day, undefined, { numeric: true }));
}

export async function getUsageStats(
  startTimestamp: number,
  endTimestamp: number,
  options: { signal?: AbortSignal } = {},
): Promise<UsageStatsSnapshot> {
  const params = { start_timestamp: startTimestamp, end_timestamp: endTimestamp };
  const [statResponse, dataResponse] = await Promise.all([
    apiClient.get<ApiResponse<UsageStatTotals>>("/api/log/stat", {
      params,
      signal: options.signal,
    }),
    apiClient.get<ApiResponse<QuotaDataPoint[]>>("/api/data/", {
      params,
      signal: options.signal,
    }),
  ]);
  const totals = readApiData(statResponse.data);
  const points = readApiData(dataResponse.data) ?? [];
  return {
    totals: {
      quota: asFiniteNumber(totals.quota),
      rpm: asFiniteNumber(totals.rpm),
      tpm: asFiniteNumber(totals.tpm),
    },
    days: groupQuotaDataByDay(Array.isArray(points) ? points : []),
  };
}
