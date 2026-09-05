import { useEffect, useState, type ReactElement } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { formatCurrency, formatQuota, formatUnixTime } from "../lib/format";
import { useSystemConfigStore, type SystemConfig } from "../stores/system-config-store";
import { useAuthStore } from "../stores/auth-store";
import { isUserNotFoundError, parsePositiveUserId } from "../features/users/api";
import { QuotaAdjustSheet } from "../features/users/components/QuotaAdjustSheet";
import { useUserDetail, useUserTopUps } from "../features/users/hooks/useUserDetail";
import { TOP_UP_PAGE_SIZE, type TopUp } from "../features/users/types";
import type { UsersSearch } from "./users";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function DetailField({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function TopUpCard({
  topUp,
  systemConfig,
}: {
  topUp: TopUp;
  systemConfig: SystemConfig;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-900">{formatCurrency(topUp.money)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {t("userDetail.quotaAmount")}: {formatQuota(topUp.amount, systemConfig)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          {t(`userDetail.statuses.${topUp.status}`, { defaultValue: topUp.status })}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm min-[380px]:grid-cols-2">
        <details className="rounded-lg border border-slate-200">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium">
            {t("userDetail.orderNumber")}
          </summary>
          <p className="break-all border-t border-slate-200 px-3 py-2">{String(topUp.id)}</p>
        </details>
        <details className="rounded-lg border border-slate-200">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium">
            {t("userDetail.tradeNumber")}
          </summary>
          <p className="break-all border-t border-slate-200 px-3 py-2">{topUp.trade_no}</p>
        </details>
        <DetailField
          label={t("userDetail.paymentMethod")}
          value={t(`userDetail.paymentMethods.${topUp.payment_method}`, {
            defaultValue: topUp.payment_method,
          })}
        />
        <DetailField label={t("userDetail.createdAt")} value={formatUnixTime(topUp.create_time)} />
      </dl>
    </article>
  );
}

export function UserDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { id: routeId } = useParams({ from: "/users/$id" });
  const navigate = useNavigate({ from: "/users/$id" });
  const search = useSearch({ from: "/users/$id" }) as UsersSearch;
  const userId = parsePositiveUserId(routeId);
  const [topUpPage, setTopUpPage] = useState(1);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [quotaAdjusted, setQuotaAdjusted] = useState(false);
  const userQuery = useUserDetail(userId);
  const topUpsQuery = useUserTopUps(userId, topUpPage);
  const totalPages = Math.max(1, Math.ceil((topUpsQuery.data?.total ?? 0) / TOP_UP_PAGE_SIZE));
  const systemConfig = useSystemConfigStore(
    (state) => state.configs[useAuthStore.getState().activeSiteId] ?? state.config,
  );

  useEffect(() => {
    setTopUpPage(1);
  }, [userId]);

  const backSearch = {
    keyword: search.keyword,
    status: search.status,
    balance: search.balance,
    page: search.page,
  };

  useEffect(() => {
    if (!isUserNotFoundError(userQuery.error)) return;
    void navigate({
      to: "/users",
      search: backSearch,
      replace: true,
    });
  }, [navigate, search.balance, search.keyword, search.page, search.status, userQuery.error]);
  if (isUserNotFoundError(userQuery.error)) {
    return (
      <section className="flex flex-1 flex-col gap-4" aria-labelledby="user-title">
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h1 id="user-title" className="text-xl font-semibold tracking-tight">
            {t("userDetail.notFoundTitle")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("userDetail.notFoundDescription")}
          </p>
        </div>
      </section>
    );
  }
  if (userId === null) {
    return (
      <section className="flex flex-1 flex-col gap-4" aria-labelledby="user-title">
        <Link
          to="/users"
          search={backSearch}
          className="inline-flex min-h-11 w-fit items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700"
        >
          {t("userDetail.backToUsers")}
        </Link>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h1 id="user-title" className="text-xl font-semibold tracking-tight">
            {t("userDetail.invalidTitle")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("userDetail.invalidDescription")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="flex flex-1 flex-col gap-4 pb-[calc(6rem+env(safe-area-inset-bottom))]"
      aria-labelledby="user-title"
    >
      <div className="flex items-center gap-3">
        <Link
          to="/users"
          search={backSearch}
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700"
        >
          {t("userDetail.backToUsers")}
        </Link>
        <h1 id="user-title" className="min-w-0 truncate text-2xl font-semibold tracking-tight">
          {t("userDetail.title")}
        </h1>
      </div>
      {quotaAdjusted ? (
        <p
          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          role="status"
          aria-live="polite"
        >
          {t("userDetail.quotaAdjusted")}
        </p>
      ) : null}

      {userQuery.isPending ? (
        <div
          className="space-y-3"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={t("userDetail.loadingUser")}
        >
          <div className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white" />
          <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      ) : userQuery.isError ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm text-red-800">
            {errorMessage(userQuery.error, t("userDetail.userError"))}
          </p>
          <button
            type="button"
            onClick={() => void userQuery.refetch()}
            disabled={userQuery.isFetching}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-red-800 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {userQuery.isFetching ? t("userDetail.retrying") : t("userDetail.retry")}
          </button>
        </div>
      ) : userQuery.data ? (
        <>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">{t("userDetail.identity")}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              <DetailField label={t("userDetail.username")} value={userQuery.data.username} />
              <DetailField
                label={t("userDetail.displayName")}
                value={userQuery.data.display_name?.trim() || t("userDetail.notAvailable")}
              />
              <DetailField
                label={t("userDetail.email")}
                value={userQuery.data.email?.trim() || t("userDetail.notAvailable")}
              />
              <DetailField
                label={t("userDetail.status")}
                value={
                  userQuery.data.status === 1
                    ? t("users.enabled")
                    : userQuery.data.status === 2
                      ? t("users.disabled")
                      : String(userQuery.data.status)
                }
              />
              <DetailField label={t("userDetail.group")} value={userQuery.data.group} />
              <DetailField label={t("userDetail.id")} value={String(userQuery.data.id)} />
            </dl>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">{t("userDetail.quotaOverview")}</h2>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <DetailField
                label={t("userDetail.totalQuota")}
                value={formatQuota(userQuery.data.quota + userQuery.data.used_quota, systemConfig)}
              />
              <DetailField
                label={t("userDetail.usedQuota")}
                value={formatQuota(userQuery.data.used_quota, systemConfig)}
              />
              <DetailField
                label={t("userDetail.remainingQuota")}
                value={formatQuota(userQuery.data.quota, systemConfig)}
              />
            </dl>
          </article>
        </>
      ) : null}

      {userQuery.data ? (
        <button
          type="button"
          onClick={() => {
            setQuotaAdjusted(false);
            setIsAdjustOpen(true);
          }}
          className="safe-area-bottom fixed inset-x-0 bottom-0 z-20 min-h-11 bg-slate-900 px-4 pt-3 text-base font-semibold text-white shadow-[0_-4px_16px_rgba(15,23,42,0.15)]"
        >
          {t("userDetail.adjustQuota")}
        </button>
      ) : null}

      <div className="mt-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("userDetail.topupHistory")}</h2>
        <span className="text-sm text-slate-500">
          {t("userDetail.pageOf", { page: topUpPage, total: totalPages })}
        </span>
      </div>
      {topUpsQuery.isPending ? (
        <div
          className="space-y-3"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={t("userDetail.loadingTopups")}
        >
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : topUpsQuery.isError ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm text-red-800">
            {errorMessage(topUpsQuery.error, t("userDetail.topupError"))}
          </p>
          <button
            type="button"
            onClick={() => void topUpsQuery.refetch()}
            disabled={topUpsQuery.isFetching}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-red-800 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {topUpsQuery.isFetching ? t("userDetail.retrying") : t("userDetail.retry")}
          </button>
        </div>
      ) : topUpsQuery.data?.items.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600"
          role="status"
          aria-live="polite"
        >
          {t("userDetail.topupEmpty")}
        </div>
      ) : (
        <div className="space-y-3" aria-live="polite">
          {topUpsQuery.data?.items.map((topUp) => (
            <TopUpCard key={topUp.id} topUp={topUp} systemConfig={systemConfig} />
          ))}
        </div>
      )}
      <nav
        className="flex items-center justify-between gap-3"
        aria-label={t("userDetail.pagination") as string}
      >
        <button
          type="button"
          onClick={() => setTopUpPage((page) => Math.max(1, page - 1))}
          disabled={topUpPage <= 1 || topUpsQuery.isFetching}
          className="min-h-11 min-w-24 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("users.previous")}
        </button>
        <span className="text-sm text-slate-600">
          {t("userDetail.pageOf", { page: topUpPage, total: totalPages })}
        </span>
        <button
          type="button"
          onClick={() => setTopUpPage((page) => Math.min(totalPages, page + 1))}
          disabled={topUpPage >= totalPages || topUpsQuery.isFetching}
          className="min-h-11 min-w-24 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("users.next")}
        </button>
      </nav>

      {isAdjustOpen && userQuery.data ? (
        <QuotaAdjustSheet
          user={userQuery.data}
          onClose={() => setIsAdjustOpen(false)}
          onSuccess={() => setQuotaAdjusted(true)}
        />
      ) : null}
    </section>
  );
}
