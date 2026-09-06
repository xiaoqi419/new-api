import type { ReactElement } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { formatQuota } from "../../../lib/format";
import { useSystemConfigStore } from "../../../stores/system-config-store";
import { useAuthStore } from "../../../stores/auth-store";
import { useUsers } from "../hooks/useUsers";
import { normalizeUserQuery, type User } from "../types";

type UsersSearch = {
  keyword?: string;
  status?: "1" | "2";
  balance?: "negative";
  page?: number;
};

export function UserListPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: "/users" });
  const search = useSearch({ from: "/users" }) as UsersSearch;
  const query = normalizeUserQuery(search);
  const usersQuery = useUsers(query);
  const totalPages = Math.max(1, Math.ceil((usersQuery.data?.total ?? 0) / query.pageSize));
  const systemConfig = useSystemConfigStore(
    (state) => state.configs[useAuthStore.getState().activeSiteId] ?? state.config,
  );

  function updateSearch(changes: Partial<UsersSearch>, resetPage = true): void {
    void navigate({
      search: (current) => ({
        ...current,
        ...changes,
        ...(resetPage ? { page: undefined } : {}),
      }),
      replace: true,
    });
  }

  function openUser(user: User): void {
    void navigate({
      to: "/users/$id",
      params: { id: String(user.id) },
      search: {
        keyword: query.keyword || undefined,
        status: query.status || undefined,
        balance: query.balance || undefined,
        page: query.page,
      },
    });
  }

  const errorText =
    usersQuery.error instanceof Error && usersQuery.error.message.trim()
      ? usersQuery.error.message
      : t("users.error");

  let usersContent: ReactElement;
  if (usersQuery.isPending) {
    usersContent = (
      <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">{t("users.loading")}</span>
        {["one", "two", "three", "four", "five"].map((key) => (
          <div
            key={key}
            className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    );
  } else if (usersQuery.isError) {
    usersContent = (
      <div
        className="rounded-xl border border-red-200 bg-red-50 p-4"
        role="alert"
        aria-live="assertive"
      >
        <p className="text-sm text-red-800">{errorText}</p>
        <button
          type="button"
          onClick={() => void usersQuery.refetch()}
          disabled={usersQuery.isFetching}
          className="mt-3 min-h-11 rounded-lg bg-red-800 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {usersQuery.isFetching ? t("users.retrying") : t("users.retry")}
        </button>
      </div>
    );
  } else if (usersQuery.data?.items.length === 0) {
    usersContent = (
      <div
        className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600"
        role="status"
        aria-live="polite"
      >
        {t("users.empty")}
      </div>
    );
  } else {
    usersContent = (
      <div className="space-y-3" aria-live="polite">
        {usersQuery.data?.items.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => openUser(user)}
            aria-label={`${user.display_name?.trim() || user.username}${user.email ? ` ${user.email}` : ""}`}
            className="block min-h-11 w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{user.username}</p>
                <p className="truncate text-sm text-slate-500">
                  {user.email || t("users.noEmail")}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  user.status === 1
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {user.status === 1 ? t("users.enabled") : t("users.disabled")}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
              <span>
                <strong className="block text-sm font-medium text-slate-800">{user.group}</strong>
                {t("users.group")}
              </span>
              <span>
                <strong className="block text-sm font-medium text-slate-800">
                  {formatQuota(user.quota, systemConfig)}
                </strong>
                {t("users.quota")}
              </span>
              <span>
                <strong className="block text-sm font-medium text-slate-800">
                  {formatQuota(user.used_quota, systemConfig)}
                </strong>
                {t("users.usedQuota")}
              </span>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <section className="flex flex-1 flex-col gap-4" aria-labelledby="users-title">
      <div>
        <h1 id="users-title" className="text-2xl font-semibold tracking-tight">
          {t("users.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t("users.description")}</p>
      </div>

      <label className="relative block">
        <span className="sr-only">{t("users.searchLabel")}</span>
        <input
          aria-label={t("users.searchLabel")}
          value={query.keyword}
          onChange={(event) => updateSearch({ keyword: event.target.value || undefined })}
          placeholder={t("users.searchPlaceholder")}
          type="search"
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        />
      </label>

      <fieldset>
        <legend className="sr-only">{t("users.filters")}</legend>
        <div className="flex flex-wrap gap-2" aria-label={t("users.filters") as string}>
          {[
            ["", t("users.all")],
            ["1", t("users.enabled")],
            ["2", t("users.disabled")],
          ].map(([status, label]) => (
            <button
              key={status}
              type="button"
              onClick={() =>
                updateSearch({ status: status === "" ? undefined : (status as "1" | "2") })
              }
              className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                query.status === status
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
              aria-pressed={query.status === status}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => updateSearch({ balance: query.balance ? undefined : "negative" })}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
              query.balance
                ? "border-amber-700 bg-amber-600 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
            aria-pressed={Boolean(query.balance)}
          >
            {t("users.lowBalance")}
          </button>
        </div>
      </fieldset>

      {usersContent}

      <nav
        className="flex items-center justify-between gap-3"
        aria-label={t("users.pagination") as string}
      >
        <button
          type="button"
          onClick={() => updateSearch({ page: Math.max(1, query.page - 1) }, false)}
          disabled={query.page <= 1 || usersQuery.isFetching}
          className="min-h-11 min-w-24 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("users.previous")}
        </button>
        <span className="text-sm text-slate-600">
          {t("users.pageOf", { page: query.page, total: totalPages })}
        </span>
        <button
          type="button"
          onClick={() => updateSearch({ page: Math.min(totalPages, query.page + 1) }, false)}
          disabled={query.page >= totalPages || usersQuery.isFetching}
          className="min-h-11 min-w-24 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("users.next")}
        </button>
      </nav>
    </section>
  );
}
