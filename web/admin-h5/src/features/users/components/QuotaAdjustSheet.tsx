import { isAxiosError } from "axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { formatQuota, parseQuotaFromBalance } from "../../../lib/format";
import { useQuotaAdjustment } from "../hooks/useQuotaAdjustment";
import { useSystemConfigStore } from "../../../stores/system-config-store";
import { useAuthStore } from "../../../stores/auth-store";
import type { QuotaMode, UserDetail } from "../types";

interface QuotaAdjustSheetProps {
  user: UserDetail;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
}

interface FormValues {
  mode: QuotaMode;
  value: string;
}

function createSchema(
  t: (key: string) => string,
  config: Parameters<typeof parseQuotaFromBalance>[1],
) {
  return z
    .object({
      mode: z.enum(["add", "subtract", "override"]),
      value: z.string().superRefine((value, context) => {
        if (!value.trim()) {
          context.addIssue({ code: "custom", message: t("quotaAdjustment.validation.required") });
          return;
        }
        if (!/^\d+(?:\.\d+)?$/.test(value)) {
          context.addIssue({ code: "custom", message: t("quotaAdjustment.validation.amount") });
          return;
        }
        if (parseQuotaFromBalance(value, config) === null) {
          context.addIssue({
            code: "custom",
            message: t("quotaAdjustment.validation.safeInteger"),
          });
        }
      }),
    })
    .superRefine((values, context) => {
      const internalValue = parseQuotaFromBalance(values.value, config);
      if (internalValue === null) return;
      if ((values.mode === "add" || values.mode === "subtract") && internalValue <= 0n) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: t("quotaAdjustment.validation.positive"),
        });
      }
      if (values.mode === "override" && internalValue < 0n) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: t("quotaAdjustment.validation.nonNegative"),
        });
      }
    });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === "object" && data !== null) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message.trim();
    }
    return fallback;
  }
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
export function QuotaAdjustSheet({
  user,
  onClose,
  onSuccess,
}: QuotaAdjustSheetProps): ReactElement {
  const { t } = useTranslation();
  const systemConfig = useSystemConfigStore(
    (state) => state.configs[useAuthStore.getState().activeSiteId] ?? state.config,
  );
  const schema = createSchema(t, systemConfig);
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const mutation = useQuotaAdjustment(user.id, async () => {
    onClose();
    await onSuccess?.();
  });
  const dialogRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  busyRef.current = isSubmitting || mutation.isPending;
  onCloseRef.current = () => {
    if (!busyRef.current) onClose();
  };
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const getFocusable = (): HTMLElement[] =>
      Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute("disabled"),
      );

    getFocusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = getFocusable();
      if (elements.length === 0) return;
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        elements[0].focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { mode: "add", value: "" },
  });
  const mode = form.watch("mode");
  const rawValue = form.watch("value");
  const parsedValue = parseQuotaFromBalance(rawValue, systemConfig);
  const numericValue =
    parsedValue !== null && parsedValue <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(parsedValue)
      : null;
  const currentQuota = Number.isSafeInteger(user.quota) ? BigInt(user.quota) : null;
  const preview =
    parsedValue !== null && currentQuota !== null
      ? mode === "add"
        ? currentQuota + parsedValue
        : mode === "subtract"
          ? currentQuota - parsedValue
          : parsedValue
      : null;
  const canContinue =
    numericValue !== null &&
    Number.isSafeInteger(numericValue) &&
    (mode === "override" ? numericValue >= 0 : numericValue > 0);
  const errorMessage = getErrorMessage(mutation.error, t("quotaAdjustment.error"));

  function continueToConfirmation(): void {
    if (!canContinue) {
      void form.trigger();
      return;
    }
    setStep(2);
  }

  async function confirmAdjustment(): Promise<void> {
    if (submittedRef.current || isSubmitting || mutation.isPending) return;
    submittedRef.current = true;
    setIsSubmitting(true);
    const valid = await form.trigger();
    if (!valid || numericValue === null || !Number.isSafeInteger(numericValue)) {
      submittedRef.current = false;
      setIsSubmitting(false);
      return;
    }
    try {
      await mutation.mutateAsync({ id: user.id, action: "add_quota", value: numericValue, mode });
    } catch {
      submittedRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end bg-slate-950/40"
      onMouseDown={() => {
        if (!busyRef.current) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quota-adjust-title"
        aria-busy={mutation.isPending || isSubmitting}
        className="safe-area-bottom w-full rounded-t-2xl bg-white p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="quota-adjust-title" className="text-lg font-semibold text-slate-900">
            {t("quotaAdjustment.title")}
          </h2>
          <button
            type="button"
            aria-label={t("quotaAdjustment.close")}
            onClick={onClose}
            disabled={mutation.isPending || isSubmitting}
            className="min-h-11 min-w-11 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700"
          >
            {t("quotaAdjustment.close")}
          </button>
        </div>

        {step === 1 ? (
          <form className="mt-4 space-y-4" onSubmit={(event) => event.preventDefault()}>
            <p className="text-sm text-slate-600">
              {t("quotaAdjustment.currentQuota")}:{" "}
              <strong>{formatQuota(user.quota, systemConfig)}</strong>
            </p>
            <fieldset>
              <legend className="text-sm font-medium text-slate-800">
                {t("quotaAdjustment.mode")}
              </legend>
              <div
                className="mt-2 grid grid-cols-3 gap-2"
                role="radiogroup"
                aria-label={t("quotaAdjustment.mode")}
              >
                {(["add", "subtract", "override"] as const).map((option) => (
                  <label
                    key={option}
                    className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm font-medium focus-within:ring-2 focus-within:ring-slate-500 focus-within:ring-offset-2 ${
                      mode === option
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      value={option}
                      className="sr-only"
                      {...form.register("mode")}
                    />
                    {t(`quotaAdjustment.modes.${option}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm font-medium text-slate-800">
              {t("quotaAdjustment.value")}
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.value)}
                aria-describedby="quota-adjust-value-error"
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                {...form.register("value")}
              />
            </label>
            <p id="quota-adjust-value-error" className="min-h-5 text-sm text-red-700" role="alert">
              {form.formState.errors.value?.message}
            </p>
            {preview !== null ? (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">
                {t("quotaAdjustment.preview", {
                  current: formatQuota(user.quota, systemConfig),
                  result: formatQuota(preview, systemConfig),
                })}
              </p>
            ) : null}
            {mode !== "add" ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="note">
                {t(`quotaAdjustment.warnings.${mode}`)}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700"
              >
                {t("quotaAdjustment.cancel")}
              </button>
              <button
                type="button"
                onClick={continueToConfirmation}
                disabled={!canContinue}
                className="min-h-11 flex-1 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("quotaAdjustment.continue")}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-800">
              {t("quotaAdjustment.value")}
              <input
                type="text"
                value={rawValue}
                readOnly
                aria-label={t("quotaAdjustment.value")}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-base"
              />
            </label>{" "}
            <p className="text-sm text-slate-700">
              {t("quotaAdjustment.confirmDescription", {
                mode: t(`quotaAdjustment.modes.${mode}`),
                value: formatQuota(numericValue ?? 0, systemConfig),
              })}
            </p>
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">
              {t("quotaAdjustment.preview", {
                current: formatQuota(user.quota, systemConfig),
                result: formatQuota(preview ?? user.quota, systemConfig),
              })}
            </p>
            {mode !== "add" ? (
              <p
                className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
                role="alert"
              >
                {t(`quotaAdjustment.warnings.${mode}`)}
              </p>
            ) : null}
            {mutation.isError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={mutation.isPending || isSubmitting}
                className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("quotaAdjustment.back")}
              </button>
              <button
                type="button"
                onClick={() => void confirmAdjustment()}
                disabled={mutation.isPending || isSubmitting}
                className="min-h-11 flex-1 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutation.isPending ? t("quotaAdjustment.saving") : t("quotaAdjustment.confirm")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
