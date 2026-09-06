import type { ReactElement } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { formatQuota } from "../../../lib/format";
import { useAuthStore } from "../../../stores/auth-store";
import { useSystemConfigStore } from "../../../stores/system-config-store";
import { useUsageStats } from "../hooks/useUsageStats";
import {
  applyDisplayMultiplier,
  isStatsRange,
  STATS_RANGES,
  USAGE_DISPLAY_MULTIPLIER,
  type StatsRange,
} from "../range";

const RANGE_LABEL_KEYS: Record<StatsRange, string> = {
  today: "stats.today",
  yesterday: "stats.yesterday",
  "7d": "stats.last7Days",
  "30d": "stats.last30Days",
};

export function StatsPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: "/stats" });
  const search = useSearch({ from: "/stats" }) as { range?: string };
  const range: StatsRange = isStatsRange(search.range) ? search.range : "today";
  const statsQuery = useUsageStats(range);
  const systemConfig = useSystemConfigStore(
    (state) => state.configs[useAuthStore.getState().activeSiteId] ?? state.config,
  );
  const totals = statsQuery.data?.totals;
  const days = statsQuery.data?.days ?? [];

  function setRange(next: StatsRange): void {
    void navigate({
      search: { range: next === "today" ? undefined : next },
      replace: true,
    });
  }

  return (
    <section className="flex flex-1 flex-col gap-4" aria-labelledby="stats-title">
      <div>
        <h1 id="stats-title" className="text-2xl font-semibold tracking-tight">
          {t("stats.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t("stats.description", { multiplier: USAGE_DISPLAY_MULTIPLIER })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("stats.range")}>
        {STATS_RANGES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={range === option}
            onClick={() => setRange(option)}
            className={`min-h-11 rounded-xl px-3 text-sm font-medium ${
              range === option
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            {t(RANGE_LABEL_KEYS[option])}
          </button>
        ))}
      </div>

      {statsQuery.isPending ? <p className="text-sm text-slate-600">{t("stats.loading")}</p> : null}

      {statsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{t("stats.error")}</p>
          <button
            type="button"
            onClick={() => void statsQuery.refetch()}
            className="mt-3 min-h-11 rounded-lg bg-red-800 px-3 text-sm font-medium text-white"
          >
            {statsQuery.isFetching ? t("stats.retrying") : t("stats.retry")}
          </button>
        </div>
      ) : null}

      {totals && !statsQuery.isError ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-500">{t("stats.requests")}</dt>
            <dd className="mt-1 text-xl font-semibold">
              {applyDisplayMultiplier(totals.rpm).toLocaleString()}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-500">{t("stats.tokens")}</dt>
            <dd className="mt-1 text-xl font-semibold">
              {applyDisplayMultiplier(totals.tpm).toLocaleString()}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-500">{t("stats.quota")}</dt>
            <dd className="mt-1 text-xl font-semibold">
              {formatQuota(applyDisplayMultiplier(totals.quota), systemConfig)}
            </dd>
          </div>
        </dl>
      ) : null}

      {days.length > 0 && !statsQuery.isError ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t("stats.dailyCaption")}</caption>
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("stats.day")}</th>
                <th className="px-4 py-3 font-medium">{t("stats.requests")}</th>
                <th className="px-4 py-3 font-medium">{t("stats.tokens")}</th>
                <th className="px-4 py-3 font-medium">{t("stats.quota")}</th>
              </tr>
            </thead>
            <tbody>
              {days.map((row) => (
                <tr key={row.day} className="border-t border-slate-100">
                  <td className="px-4 py-3">{row.day}</td>
                  <td className="px-4 py-3">{applyDisplayMultiplier(row.count).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {applyDisplayMultiplier(row.tokenUsed).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {formatQuota(applyDisplayMultiplier(row.quota), systemConfig)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!statsQuery.isPending && !statsQuery.isError && days.length === 0 ? (
        <p className="text-sm text-slate-600">{t("stats.empty")}</p>
      ) : null}
    </section>
  );
}
