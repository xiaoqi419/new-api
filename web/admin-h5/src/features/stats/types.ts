export interface QuotaDataPoint {
  created_at: number;
  count: number;
  quota: number;
  token_used: number;
  model_name?: string;
}

export interface UsageStatTotals {
  quota: number;
  rpm: number;
  tpm: number;
}

export interface UsageDayRow {
  day: string;
  count: number;
  quota: number;
  tokenUsed: number;
}

export interface UsageStatsSnapshot {
  totals: UsageStatTotals;
  days: UsageDayRow[];
}
