import { useEffect, useRef, useState, type ReactElement } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { useAuth } from "../hooks/useAuth";
import { isAuthBundle, isTwoFactorChallenge } from "../types";
import { useAuthStore } from "../../../stores/auth-store";
import { siteConfigs } from "../../../env";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const twoFactorSchema = z.object({
  code: z.string().trim().min(6).max(8),
});

type LoginValues = z.infer<typeof loginSchema>;
type TwoFactorValues = z.infer<typeof twoFactorSchema>;

type ApiErrorShape = { response?: { data?: { message?: unknown } } };

function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const message = (error as ApiErrorShape).response?.data?.message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

function sessionId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const session = (value as { session?: unknown }).session;
  if (typeof session !== "object" || session === null) return null;
  const sid = (session as { sid?: unknown }).sid;
  return typeof sid === "string" && sid.trim().length > 0 ? sid : null;
}

export function SignInPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const siteId = useAuthStore((state) => state.activeSiteId);
  const { signIn, verifyTwoFactor, signOut, reset, beginSignIn } = useAuth(siteId);
  const [flowToken, setFlowToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const twoFactorForm = useForm<TwoFactorValues>({
    resolver: zodResolver(twoFactorSchema),
    defaultValues: { code: "" },
  });

  async function onLogin(values: LoginValues): Promise<void> {
    setFormError(null);
    try {
      const generation = beginSignIn?.() ?? useAuthStore.getState().sites[siteId].generation;
      const response = await signIn(values);
      if (!mounted.current || useAuthStore.getState().sites[siteId].generation !== generation) {
        return;
      }
      loginForm.reset({ username: values.username, password: "" });
      if (!response.success) {
        setFormError(response.message || t("auth.errors.signIn"));
        return;
      }
      if (response.data && isTwoFactorChallenge(response.data)) {
        setFlowToken(response.data.flow_token);
        twoFactorForm.reset();
        return;
      }
      if (response.data) {
        if (isAuthBundle(response.data)) {
          await navigate({ to: "/users", replace: true });
        } else {
          try {
            const sid = sessionId(response.data);
            if (sid) await signOut(sid);
          } catch {
            // signOut always resets local auth state even when the endpoint fails.
          }
          reset();
          setFormError(t("auth.errors.permission"));
        }
        return;
      }
      setFormError(t("auth.errors.signIn"));
    } catch (error) {
      if (mounted.current) {
        reset();
        setFormError(apiErrorMessage(error, t("auth.errors.network")));
      }
    }
  }

  async function onTwoFactor(values: TwoFactorValues): Promise<void> {
    if (!flowToken) return;
    setFormError(null);
    try {
      const response = await verifyTwoFactor({ flow_token: flowToken, code: values.code });
      if (!mounted.current) return;
      twoFactorForm.reset();
      if (response.success && response.data) {
        setFlowToken(null);
        if (isAuthBundle(response.data)) {
          await navigate({ to: "/users", replace: true });
        } else {
          try {
            const sid = sessionId(response.data);
            if (sid) await signOut(sid);
          } catch {
            // signOut always resets local auth state even when the endpoint fails.
          }
          reset();
          setFormError(t("auth.errors.permission"));
        }
        return;
      }
      setFormError(response.message || t("auth.errors.verification"));
    } catch (error) {
      setFormError(apiErrorMessage(error, t("auth.errors.network")));
    }
  }

  const loginUsernameError = loginForm.formState.errors.username?.message;
  const loginPasswordError = loginForm.formState.errors.password?.message;
  const codeError = twoFactorForm.formState.errors.code?.message;
  const isTwoFactor = flowToken !== null;

  return (
    <section
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6"
      aria-labelledby="sign-in-title"
    >
      <div>
        <h1 id="sign-in-title" className="text-2xl font-semibold tracking-tight">
          {t("sections.signInTitle")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t("sections.signInDescription")}</p>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          {t(`site.${siteId}`, { defaultValue: siteConfigs[siteId].label })}
        </p>
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {formError}
        </p>
      ) : null}

      {isTwoFactor ? (
        <form
          className="flex flex-col gap-4"
          // oxlint-disable-next-line react/refs -- react-hook-form exposes handleSubmit as a stable event handler.
          onSubmit={twoFactorForm.handleSubmit(onTwoFactor)}
          noValidate
        >
          <div>
            <label
              htmlFor="verification-code"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {t("auth.verificationCode")}
            </label>
            <input
              id="verification-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              aria-invalid={codeError ? "true" : undefined}
              aria-describedby={codeError ? "verification-code-error" : undefined}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              {...twoFactorForm.register("code")}
            />
            {codeError ? (
              <p id="verification-code-error" className="mt-1 text-sm text-red-700">
                {t("auth.errors.required")}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={twoFactorForm.formState.isSubmitting}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {twoFactorForm.formState.isSubmitting ? t("auth.loading") : t("auth.verify")}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          // oxlint-disable-next-line react/refs -- react-hook-form exposes handleSubmit as a stable event handler.
          onSubmit={loginForm.handleSubmit(onLogin)}
          noValidate
        >
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
              {t("auth.username")}
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              aria-invalid={loginUsernameError ? "true" : undefined}
              aria-describedby={loginUsernameError ? "username-error" : undefined}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              {...loginForm.register("username")}
            />
            {loginUsernameError ? (
              <p id="username-error" className="mt-1 text-sm text-red-700">
                {t("auth.errors.required")}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={loginPasswordError ? "true" : undefined}
              aria-describedby={loginPasswordError ? "password-error" : undefined}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              {...loginForm.register("password")}
            />
            {loginPasswordError ? (
              <p id="password-error" className="mt-1 text-sm text-red-700">
                {t("auth.errors.required")}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={loginForm.formState.isSubmitting}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loginForm.formState.isSubmitting ? t("auth.loading") : t("auth.signIn")}
          </button>
        </form>
      )}
    </section>
  );
}
