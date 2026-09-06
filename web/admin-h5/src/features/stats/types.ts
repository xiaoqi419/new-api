export interface QuotaDataPoint {
  created_at: number;
  count: number;
  quota: number;
  token_used: number;
  model_name?: string;
}

export interface UsageTotals {
  count: number;
  quota: number;
  tokenUsed: number;
}

export interface UsageDayRow {
  day: string;
  count: number;
  quota: number;
  tokenUsed: number;
}

export interface UsageModelRow {
  model: string;
  count: number;
  quota: number;
  tokenUsed: number;
}

export interface UsageStatsSnapshot {
  totals: UsageTotals;
  days: UsageDayRow[];
  models: UsageModelRow[];
}
