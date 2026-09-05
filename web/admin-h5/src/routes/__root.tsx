import type { ReactElement } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/AppShell";

export function RootLayout(): ReactElement {
  return <AppShell />;
}

export function AppNotFoundFallback(): ReactElement {
  const { t } = useTranslation();

  return (
    <section
      className="flex flex-1 flex-col justify-center gap-3"
      aria-labelledby="not-found-title"
    >
      <h1 id="not-found-title" className="text-2xl font-semibold tracking-tight">
        {t("app.fallbacks.notFoundTitle")}
      </h1>
      <p className="max-w-prose text-sm leading-6 text-slate-600">
        {t("app.fallbacks.notFoundDescription")}
      </p>
      <Link
        to="/users"
        className="mt-2 inline-flex min-h-11 w-fit items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white"
      >
        {t("app.navigation.users")}
      </Link>
    </section>
  );
}

export function AppErrorFallback(): ReactElement {
  const { t } = useTranslation();

  return (
    <section className="flex flex-1 flex-col justify-center gap-3" aria-labelledby="error-title">
      <h1 id="error-title" className="text-2xl font-semibold tracking-tight">
        {t("app.fallbacks.errorTitle")}
      </h1>
      <p className="max-w-prose text-sm leading-6 text-slate-600">
        {t("app.fallbacks.errorDescription")}
      </p>
      <Link
        to="/users"
        className="mt-2 inline-flex min-h-11 w-fit items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white"
      >
        {t("app.navigation.users")}
      </Link>
    </section>
  );
}
