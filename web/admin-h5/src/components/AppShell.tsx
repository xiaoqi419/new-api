import { useEffect, type ReactElement } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useAuth } from "../features/auth/hooks/useAuth";
import { siteIds, siteConfigs, type SiteId } from "../env";
import { useAuthStore } from "../stores/auth-store";
import { loadSystemConfig } from "../stores/system-config-store";
import { setAuthNavigation } from "../lib/api-client";

export function AppShell(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeSiteId = useAuthStore((state) => state.activeSiteId);
  const setActiveSite = useAuthStore((state) => state.setActiveSite);
  const { isAuthenticated, signOut } = useAuth(activeSiteId);

  useEffect(() => {
    void loadSystemConfig();
  }, [activeSiteId]);
  useEffect(() => {
    setAuthNavigation(() => {
      void navigate({ to: "/sign-in", replace: true });
    });
    return () => setAuthNavigation(null);
  }, [navigate]);
  async function handleSignOut(): Promise<void> {
    try {
      await signOut();
    } finally {
      await navigate({ to: "/sign-in", replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-[env(safe-area-inset-bottom)] text-slate-900">
      <header className="border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="safe-area-inline mx-auto flex min-h-14 max-w-3xl items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to={isAuthenticated ? "/users" : "/sign-in"}
              className="flex min-h-11 items-center text-base font-semibold text-slate-900"
            >
              {t("app.title")}
            </Link>
            {isAuthenticated ? (
              <nav className="flex items-center gap-1" aria-label={t("app.navigation.label")}>
                <Link
                  to="/stats"
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  {t("app.navigation.stats")}
                </Link>
                <Link
                  to="/users"
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  {t("app.navigation.users")}
                </Link>
              </nav>
            ) : null}
          </div>
          <div
            className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
            aria-label={t("site.switcher") as string}
          >
            {siteIds.map((siteId) => (
              <button
                key={siteId}
                type="button"
                disabled={isAuthenticated}
                title={isAuthenticated ? (t("site.signOutToSwitch") as string) : undefined}
                onClick={() => setActiveSite(siteId as SiteId)}
                className={`min-h-9 rounded-md px-2 text-xs font-medium ${activeSiteId === siteId ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {t(`site.${siteId}`, { defaultValue: siteConfigs[siteId].label })}
              </button>
            ))}
          </div>
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t("auth.signOut")}
            </button>
          ) : null}
        </div>
      </header>
      <main className="safe-area-inline mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-3xl flex-col py-6">
        <Outlet />
      </main>
    </div>
  );
}
