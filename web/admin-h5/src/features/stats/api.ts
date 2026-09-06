import { apiClient } from "../../lib/api-client";
import type { ApiResponse } from "../auth/types";
import type {
  QuotaDataPoint,
  UsageDayRow,
  UsageModelRow,
  UsageStatsSnapshot,
  UsageTotals,
} from "./types";

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

function addUsage(
  current: UsageTotals,
  point: Pick<QuotaDataPoint, "count" | "quota" | "token_used">,
): UsageTotals {
  return {
    count: current.count + asFiniteNumber(point.count),
    quota: current.quota + asFiniteNumber(point.quota),
    tokenUsed: current.tokenUsed + asFiniteNumber(point.token_used),
  };
}

export function groupQuotaDataByDay(points: QuotaDataPoint[]): UsageDayRow[] {
  const buckets = new Map<string, UsageTotals>();
  for (const point of points) {
    const createdAt = asFiniteNumber(point.created_at);
    const day = new Date(createdAt * 1000).toLocaleDateString();
    buckets.set(day, addUsage(buckets.get(day) ?? { count: 0, quota: 0, tokenUsed: 0 }, point));
  }
  return [...buckets.entries()]
    .map(([day, values]) => ({ day, ...values }))
    .sort((left, right) => left.day.localeCompare(right.day, undefined, { numeric: true }));
}

export function groupQuotaDataByModel(points: QuotaDataPoint[]): UsageModelRow[] {
  const buckets = new Map<string, UsageTotals>();
  for (const point of points) {
    const model = typeof point.model_name === "string" && point.model_name.trim()
      ? point.model_name.trim()
      : "";
    buckets.set(model, addUsage(buckets.get(model) ?? { count: 0, quota: 0, tokenUsed: 0 }, point));
  }
  return [...buckets.entries()]
    .map(([model, values]) => ({ model, ...values }))
    .sort((left, right) => right.quota - left.quota || left.model.localeCompare(right.model));
}

export function summarizeQuotaData(points: QuotaDataPoint[]): UsageStatsSnapshot {
  const totals = points.reduce(
    (acc, point) => addUsage(acc, point),
    { count: 0, quota: 0, tokenUsed: 0 },
  );
  return {
    totals,
    days: groupQuotaDataByDay(points),
    models: groupQuotaDataByModel(points),
  };
}

export async function getUsageStats(
  startTimestamp: number,
  endTimestamp: number,
  options: { signal?: AbortSignal } = {},
): Promise<UsageStatsSnapshot> {
  const response = await apiClient.get<ApiResponse<QuotaDataPoint[]>>("/api/data/", {
    params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp },
    signal: options.signal,
  });
  const points = readApiData(response.data) ?? [];
  return summarizeQuotaData(Array.isArray(points) ? points : []);
}
