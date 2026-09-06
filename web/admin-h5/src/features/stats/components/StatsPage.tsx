import type { ReactElement } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { formatQuota } from "../../../lib/format";
import { useAuthStore } from "../../../stores/auth-store";
import {
  useSystemConfigStore,
  type SystemConfig,
} from "../../../stores/system-config-store";
import { useUsageStats } from "../hooks/useUsageStats";
import {
  applyDisplayMultiplier,
  isStatsRange,
  STATS_RANGES,
  type StatsRange,
} from "../range";

const RANGE_LABEL_KEYS: Record<StatsRange, string> = {
  today: "stats.today",
  yesterday: "stats.yesterday",
  "7d": "stats.last7Days",
  "30d": "stats.last30Days",
};

function displayCount(value: number): string {
  return applyDisplayMultiplier(value).toLocaleString();
}

function displayQuota(value: number, config: SystemConfig): string {
  return formatQuota(applyDisplayMultiplier(value), config);
}

export function StatsPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: "/stats" });
  const search = useSearch({ from: "/stats" }) as { range?: string };
  const range: StatsRange = isStatsRange(search.range) ? search.range : "today";
  const statsQuery = useUsageStats(range);
  const activeSiteId = useAuthStore((state) => state.activeSiteId);
  const systemConfig = useSystemConfigStore(
    (state) => state.configs[activeSiteId] ?? state.config,
  );
  const totals = statsQuery.data?.totals;
  const days = statsQuery.data?.days ?? [];
  const models = statsQuery.data?.models ?? [];

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
          {t("stats.description", { site: t(`site.${activeSiteId}`) })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("stats.range")}>
        {STATS_RANGES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={range === option}
            disabled={statsQuery.isFetching}
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
        <dl
          className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${statsQuery.isFetching ? "opacity-60" : ""}`}
          aria-busy={statsQuery.isFetching}
        >
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-500">{t("stats.requests")}</dt>
            <dd className="mt-1 text-xl font-semibold">{displayCount(totals.count)}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-500">{t("stats.tokens")}</dt>
            <dd className="mt-1 text-xl font-semibold">{displayCount(totals.tokenUsed)}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-500">{t("stats.quota")}</dt>
            <dd className="mt-1 text-xl font-semibold">{displayQuota(totals.quota, systemConfig)}</dd>
          </div>
        </dl>
      ) : null}

      {days.length > 0 && !statsQuery.isError ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="px-4 py-3 text-left text-sm font-medium text-slate-700">
              {t("stats.dailyCaption")}
            </caption>
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
                  <td className="px-4 py-3">{displayCount(row.count)}</td>
                  <td className="px-4 py-3">{displayCount(row.tokenUsed)}</td>
                  <td className="px-4 py-3">{displayQuota(row.quota, systemConfig)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {models.length > 0 && !statsQuery.isError ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="px-4 py-3 text-left text-sm font-medium text-slate-700">
              {t("stats.modelCaption")}
            </caption>
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("stats.model")}</th>
                <th className="px-4 py-3 font-medium">{t("stats.requests")}</th>
                <th className="px-4 py-3 font-medium">{t("stats.tokens")}</th>
                <th className="px-4 py-3 font-medium">{t("stats.quota")}</th>
              </tr>
            </thead>
            <tbody>
              {models.map((row) => (
                <tr key={row.model || "unknown"} className="border-t border-slate-100">
                  <td className="px-4 py-3 break-all">
                    {row.model || t("stats.unknownModel")}
                  </td>
                  <td className="px-4 py-3">{displayCount(row.count)}</td>
                  <td className="px-4 py-3">{displayCount(row.tokenUsed)}</td>
                  <td className="px-4 py-3">{displayQuota(row.quota, systemConfig)}</td>
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
