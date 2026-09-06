import { DEFAULT_SYSTEM_CONFIG, type SystemConfig } from "../stores/system-config-store";

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function decimalFraction(value: string): { numerator: bigint; denominator: bigint } | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;

  const fractional = match[2] ?? "";
  return {
    numerator: BigInt(`${match[1]}${fractional}`),
    denominator: 10n ** BigInt(fractional.length),
  };
}

function numberFraction(value: number): { numerator: bigint; denominator: bigint } | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return decimalFraction(String(value));
}

function roundPositiveFraction(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator % denominator >= (denominator + 1n) / 2n ? quotient + 1n : quotient;
}

function getExchangeRate(config: SystemConfig): number {
  if (config.quotaDisplayType === "CNY") return config.usdExchangeRate;
  if (config.quotaDisplayType === "CUSTOM") return config.customCurrencyExchangeRate;
  return 1;
}

function removeTrailingZeros(value: string): string {
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function formatNumberWithSuffix(
  value: number,
  digitsLarge: number,
  digitsSmall: number,
  abbreviate: boolean,
): string {
  const abs = Math.abs(value);
  if (abbreviate && abs >= 1000) {
    return `${removeTrailingZeros((value / 1000).toFixed(1))}k`;
  }
  const digits = abs >= 1 ? digitsLarge : digitsSmall;
  return removeTrailingZeros(value.toFixed(digits));
}

function getCurrencyFormatter(currency: "USD" | "CNY", digits: number): Intl.NumberFormat {
  const key = `${currency}:${digits}`;
  const formatter = currencyFormatters.get(key);
  if (formatter) return formatter;

  const nextFormatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  currencyFormatters.set(key, nextFormatter);
  return nextFormatter;
}

function formatCurrencyValue(value: number, config: SystemConfig): string {
  const digits = Math.abs(value) >= 1 ? 2 : 4;
  if (config.quotaDisplayType === "CUSTOM") {
    return `${config.customCurrencySymbol} ${removeTrailingZeros(value.toFixed(digits))}`;
  }
  return getCurrencyFormatter(config.quotaDisplayType === "CNY" ? "CNY" : "USD", digits).format(
    value,
  );
}

export function formatQuota(
  quota: number | bigint,
  config: SystemConfig = DEFAULT_SYSTEM_CONFIG,
): string {
  const numericQuota = typeof quota === "bigint" ? Number(quota) : quota;
  if (!Number.isFinite(numericQuota) || config.quotaPerUnit <= 0) return "-";

  if (config.quotaDisplayType === "TOKENS") {
    return formatNumberWithSuffix(numericQuota, 2, 4, true);
  }

  const displayAmount = (numericQuota / config.quotaPerUnit) * getExchangeRate(config);
  return formatCurrencyValue(displayAmount, config);
}

/** Convert the configured balance input back to New API's internal quota units. */
export function parseQuotaFromBalance(
  value: string,
  config: SystemConfig = DEFAULT_SYSTEM_CONFIG,
): bigint | null {
  const amount = decimalFraction(value);
  if (!amount) return null;

  if (config.quotaDisplayType === "TOKENS") {
    const quota = roundPositiveFraction(amount.numerator, amount.denominator);
    return quota <= MAX_SAFE_BIGINT ? quota : null;
  }

  const rate = numberFraction(getExchangeRate(config));
  const quotaPerUnit = Number.isSafeInteger(config.quotaPerUnit)
    ? BigInt(config.quotaPerUnit)
    : null;
  if (!rate || !quotaPerUnit || quotaPerUnit <= 0n) return null;

  const numerator = amount.numerator * rate.denominator * quotaPerUnit;
  const denominator = amount.denominator * rate.numerator;
  const quota = roundPositiveFraction(numerator, denominator);
  return quota <= MAX_SAFE_BIGINT ? quota : null;
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatUnixTime(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
