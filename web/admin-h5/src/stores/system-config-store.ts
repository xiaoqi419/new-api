import { create } from "zustand";

import type { ApiResponse } from "../features/auth/types";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "./auth-store";

export type QuotaDisplayType = "USD" | "CNY" | "CUSTOM" | "TOKENS";

export interface SystemConfig {
  quotaPerUnit: number;
  quotaDisplayType: QuotaDisplayType;
  usdExchangeRate: number;
  customCurrencySymbol: string;
  customCurrencyExchangeRate: number;
}

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  quotaPerUnit: 500_000,
  quotaDisplayType: "USD",
  usdExchangeRate: 1,
  customCurrencySymbol: "¤",
  customCurrencyExchangeRate: 1,
};

interface SystemConfigState {
  config: SystemConfig;
  configs: Record<import("../env").SiteId, SystemConfig>;
  setConfig: (config: SystemConfig) => void;
}

function finitePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function asDisplayType(value: unknown): QuotaDisplayType {
  return value === "CNY" || value === "CUSTOM" || value === "TOKENS" ? value : "USD";
}

export function normalizeSystemConfig(data: Record<string, unknown> | undefined): SystemConfig {
  return {
    quotaPerUnit: finitePositiveNumber(data?.quota_per_unit, DEFAULT_SYSTEM_CONFIG.quotaPerUnit),
    quotaDisplayType: asDisplayType(data?.quota_display_type),
    usdExchangeRate: finitePositiveNumber(
      data?.usd_exchange_rate,
      DEFAULT_SYSTEM_CONFIG.usdExchangeRate,
    ),
    customCurrencySymbol:
      typeof data?.custom_currency_symbol === "string" && data.custom_currency_symbol.trim()
        ? data.custom_currency_symbol.trim()
        : DEFAULT_SYSTEM_CONFIG.customCurrencySymbol,
    customCurrencyExchangeRate: finitePositiveNumber(
      data?.custom_currency_exchange_rate,
      DEFAULT_SYSTEM_CONFIG.customCurrencyExchangeRate,
    ),
  };
}

export const useSystemConfigStore = create<SystemConfigState>((set) => ({
  config: DEFAULT_SYSTEM_CONFIG,
  configs: { domestic: DEFAULT_SYSTEM_CONFIG, international: DEFAULT_SYSTEM_CONFIG },
  setConfig: (config) => set({ config }),
}));

export async function loadSystemConfig(): Promise<void> {
  try {
    const siteId = useAuthStore.getState().activeSiteId;
    const response = await apiClient.get<ApiResponse<Record<string, unknown>>>("/api/status");
    if (response.data.success) {
      const config = normalizeSystemConfig(response.data.data);
      useSystemConfigStore.setState((state) => ({
        config,
        configs: { ...state.configs, [siteId]: config },
      }));
    }
  } catch {
    // The default configuration keeps the H5 usable when status is unavailable.
  }
}
