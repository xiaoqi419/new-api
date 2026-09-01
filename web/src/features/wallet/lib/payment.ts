/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  PAYMENT_TYPES,
  DEFAULT_PRESET_MULTIPLIERS,
  DEFAULT_PAYMENT_TYPE,
  DEFAULT_MIN_TOPUP,
} from '../constants'
import type {
  EpayCheckoutData,
  EpayCheckoutTimestamp,
  EpayFeeSource,
  EpayNetworkFeeEvidence,
  PaymentMethod,
  PresetAmount,
  TopupInfo,
} from '../types'

// ============================================================================
// Payment Processing Functions
// ============================================================================

/**
 * Check if browser is Safari
 */
function isSafariBrowser(): boolean {
  return (
    navigator.userAgent.includes('Safari') &&
    !navigator.userAgent.includes('Chrome')
  )
}

/**
 * Submit payment form (for non-Stripe payments)
 */
export function submitPaymentForm(
  url: string,
  params: Record<string, unknown>
): void {
  const form = document.createElement('form')
  form.action = url
  form.method = 'POST'

  // Don't open in new tab for Safari
  if (!isSafariBrowser()) {
    form.target = '_blank'
  }

  // Add form parameters
  Object.entries(params).forEach(([key, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = String(value)
    form.appendChild(input)
  })

  document.body.appendChild(form)
  form.submit()
  document.body.removeChild(form)
}

/**
 * Reject non-navigable schemes (e.g. javascript:, data:) and relative URLs.
 * Only http/https are allowed for backend-provided redirect targets.
 */
export function isSafePaymentRedirectUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return false
  }
  try {
    const url = new URL(trimmed)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      Boolean(url.hostname)
    )
  } catch {
    return false
  }
}

/**
 * Epay checkout values are gateway-controlled. QR values remain inert, while
 * URL and app-scheme values must pass a narrow allowlist before being encoded
 * into the in-site QR code.
 */
export function isSafeEpayCheckoutTarget(
  checkoutType: string,
  value: string,
  paymentMethod: string
): boolean {
  if (checkoutType === 'payurl') {
    return isSafePaymentRedirectUrl(value)
  }
  if (checkoutType !== 'urlscheme') {
    return false
  }

  const normalizedValue = value.trim().toLowerCase()
  if (paymentMethod === PAYMENT_TYPES.ALIPAY) {
    return (
      normalizedValue.startsWith('alipay://') ||
      normalizedValue.startsWith('alipays://')
    )
  }
  if (paymentMethod === PAYMENT_TYPES.WECHAT) {
    return (
      normalizedValue.startsWith('weixin://') ||
      normalizedValue.startsWith('wxp://')
    )
  }
  return false
}

interface EpayCheckoutFallback {
  tradeNo?: string
  paymentMethod?: string
  money?: string | number
}

const GMPAY_CHECKOUT_AMOUNT_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const GMPAY_CHECKOUT_AMOUNT_MAX_LENGTH = 128
const GMPAY_CHECKOUT_AMOUNT_MAX_SCALE = 6
const GMPAY_CHECKOUT_AMOUNT_MAX_VALUE = 1_000_000_000
const GMPAY_NATIVE_AMOUNT_MAX_SCALE = 18
const GMPAY_QUOTE_METADATA_MAX_LENGTH = 128
const GMPAY_EVIDENCE_MAX_METHODS = 16
const GMPAY_EVIDENCE_MAX_PRICE_SOURCES = 8
const GMPAY_TIMESTAMP_MAX_MILLISECONDS = 8.64e15
const GMPAY_HOST_LABEL_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

/**
 * Normalize a server-provided GMPay amount while keeping the browser-side
 * schema aligned with the server boundary. `undefined` means the optional
 * field was not supplied; `null` means it was supplied but invalid.
 */
function normalizeOptionalGmpayAmount(
  value: unknown,
  maxScale = GMPAY_CHECKOUT_AMOUNT_MAX_SCALE
): string | undefined | null {
  if (value === undefined) return undefined

  let normalized: string
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null
    normalized = String(value)
  } else if (typeof value === 'string') {
    normalized = value.trim()
  } else {
    return null
  }

  if (
    !normalized ||
    normalized.length > GMPAY_CHECKOUT_AMOUNT_MAX_LENGTH ||
    !GMPAY_CHECKOUT_AMOUNT_PATTERN.test(normalized)
  ) {
    return null
  }

  const numericValue = Number(normalized)
  if (
    !Number.isFinite(numericValue) ||
    numericValue < 0 ||
    numericValue > GMPAY_CHECKOUT_AMOUNT_MAX_VALUE
  ) {
    return null
  }

  const [mantissa, exponentText] = normalized.toLowerCase().split('e')
  const exponent = exponentText ? Number(exponentText) : 0
  if (!Number.isFinite(exponent)) return null
  const fractionDigits = mantissa.split('.')[1]?.length ?? 0
  const scale = Math.max(0, fractionDigits - exponent)
  if (scale > maxScale) return null

  return normalized
}

/** Normalize the server-owned fee provenance enum. */
function normalizeOptionalGmpayFeeSource(
  value: unknown
): EpayFeeSource | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  switch (normalized) {
    case 'chain_network_estimate':
      return 'chain_network_estimate'
    case 'admin_fallback':
    case 'admin_fixed':
    case 'admin_percent':
      return 'admin_fallback'
    case 'gateway_quote':
      return 'gateway_quote'
    case 'gateway_included':
    case 'gateway-included':
      return 'gateway_included'
    default:
      return null
  }
}

function normalizeOptionalGmpayIdentifier(
  value: unknown,
  pattern: RegExp,
  uppercase = false
): string | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (
    !normalized ||
    normalized.length > GMPAY_QUOTE_METADATA_MAX_LENGTH ||
    !pattern.test(normalized)
  ) {
    return null
  }
  return uppercase ? normalized.toUpperCase() : normalized
}

function normalizeOptionalGmpayTimestamp(
  value: unknown
): EpayCheckoutTimestamp | undefined | null {
  if (value === undefined) return undefined
  if (typeof value === 'number') {
    return isValidGmpayTimestamp(value) ? value : null
  }
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (
    !normalized ||
    normalized.length > GMPAY_QUOTE_METADATA_MAX_LENGTH ||
    !isValidGmpayTimestamp(normalized)
  ) {
    return null
  }
  return normalized
}

function gmpayTimestampToMilliseconds(
  value: EpayCheckoutTimestamp
): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value
    return Number.isFinite(milliseconds) ? milliseconds : null
  }

  const normalized = value.trim()
  if (/^\d+$/.test(normalized)) {
    const numericValue = Number(normalized)
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null
    return numericValue < 10_000_000_000 ? numericValue * 1000 : numericValue
  }
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function isValidGmpayTimestamp(value: EpayCheckoutTimestamp): boolean {
  const milliseconds = gmpayTimestampToMilliseconds(value)
  return (
    milliseconds !== null &&
    milliseconds > 0 &&
    milliseconds <= GMPAY_TIMESTAMP_MAX_MILLISECONDS
  )
}

function isValidGmpayPriceSourceHost(value: string): boolean {
  if (value.includes(':')) {
    try {
      const parsed = new URL(`https://[${value}]`)
      return parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    } catch {
      return false
    }
  }

  return value.split('.').every((label) => GMPAY_HOST_LABEL_PATTERN.test(label))
}

function normalizeOptionalGmpayPriceSource(
  value: unknown
): string | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return null

  const normalized = value.trim()
  if (
    !normalized ||
    normalized.length > GMPAY_QUOTE_METADATA_MAX_LENGTH ||
    /\s/.test(normalized)
  ) {
    return null
  }

  const sources = normalized.split(',')
  if (
    sources.length > GMPAY_EVIDENCE_MAX_PRICE_SOURCES ||
    sources.some((source) => !source || !isValidGmpayPriceSourceHost(source))
  ) {
    return null
  }

  return sources.join(',')
}

function normalizeOptionalGmpayEvidence(
  value: unknown
): EpayNetworkFeeEvidence | undefined | null {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const fields = value as Record<string, unknown>
  const evidence: EpayNetworkFeeEvidence = {}
  const stringFields = [
    'rpc_method',
    'rpc_source',
    'price_source',
    'block',
    'gas',
    'gas_price',
    'energy',
    'bandwidth',
    'lamports',
  ] as const
  const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/
  for (const key of stringFields) {
    if (!(key in fields)) continue
    const normalized =
      key === 'price_source'
        ? normalizeOptionalGmpayPriceSource(fields[key])
        : normalizeOptionalGmpayIdentifier(fields[key], identifierPattern)
    if (normalized === null || normalized === undefined) return null
    evidence[key] = normalized
  }

  if ('rpc_methods' in fields) {
    const methods = fields.rpc_methods
    if (
      !Array.isArray(methods) ||
      methods.length > GMPAY_EVIDENCE_MAX_METHODS
    ) {
      return null
    }
    const normalizedMethods: string[] = []
    for (const method of methods) {
      const normalized = normalizeOptionalGmpayIdentifier(
        method,
        identifierPattern
      )
      if (normalized === null || normalized === undefined) return null
      normalizedMethods.push(normalized)
    }
    evidence.rpc_methods = normalizedMethods
  }

  if ('price_timestamp' in fields) {
    const timestamp = fields.price_timestamp
    if (
      typeof timestamp !== 'number' ||
      !Number.isSafeInteger(timestamp) ||
      timestamp <= 0
    ) {
      return null
    }
    evidence.price_timestamp = timestamp
  }

  if ('slot' in fields) {
    const slot = fields.slot
    if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 0) {
      return null
    }
    evidence.slot = slot
  }

  return evidence
}

export function getEpayCheckoutData(
  value: unknown,
  fallback: EpayCheckoutFallback = {}
): EpayCheckoutData | null {
  if (!value || typeof value !== 'object') return null
  const fields = value as Record<string, unknown>
  const tradeNo = fields.trade_no ?? fallback.tradeNo
  const paymentMethod = fields.payment_method ?? fallback.paymentMethod
  const money = fields.money ?? fallback.money
  if (
    typeof tradeNo !== 'string' ||
    !tradeNo.trim() ||
    typeof paymentMethod !== 'string' ||
    !paymentMethod.trim() ||
    (typeof money !== 'string' && typeof money !== 'number')
  ) {
    return null
  }
  if (
    fallback.paymentMethod &&
    paymentMethod.trim() !== fallback.paymentMethod.trim()
  ) {
    return null
  }
  if (fallback.money !== undefined) {
    const responseMoney = Number(money)
    const expectedMoney = Number(fallback.money)
    if (
      !Number.isFinite(responseMoney) ||
      !Number.isFinite(expectedMoney) ||
      responseMoney !== expectedMoney
    ) {
      return null
    }
  }

  if (fields.checkout_type === 'crypto') {
    const actualAmount = fields.actual_amount
    const receiveAddress = fields.receive_address
    const token = fields.token
    const network = fields.network
    const expirationTime = fields.expiration_time
    const serverTime = fields.server_time
    if (
      typeof actualAmount !== 'string' ||
      !/^\d+(?:\.\d+)?$/.test(actualAmount.trim()) ||
      !/[1-9]/.test(actualAmount) ||
      typeof receiveAddress !== 'string' ||
      !receiveAddress.trim() ||
      typeof token !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/.test(token.trim()) ||
      typeof network !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/.test(network.trim()) ||
      typeof expirationTime !== 'number' ||
      !Number.isFinite(expirationTime) ||
      expirationTime <= 0 ||
      (serverTime !== undefined &&
        (typeof serverTime !== 'number' ||
          !Number.isFinite(serverTime) ||
          serverTime <= 0))
    ) {
      return null
    }

    const baseAmount = normalizeOptionalGmpayAmount(fields.base_amount)
    const feeAmount = normalizeOptionalGmpayAmount(fields.fee_amount)
    const totalAmount = normalizeOptionalGmpayAmount(fields.total_amount)
    const feeSource = normalizeOptionalGmpayFeeSource(fields.fee_source)
    const nativeAmount = normalizeOptionalGmpayAmount(
      fields.native_amount,
      GMPAY_NATIVE_AMOUNT_MAX_SCALE
    )
    const nativeAsset = normalizeOptionalGmpayIdentifier(
      fields.native_asset,
      /^[A-Za-z][A-Za-z0-9._-]{0,31}$/,
      true
    )
    const settlementCurrency = normalizeOptionalGmpayIdentifier(
      fields.settlement_currency,
      /^[A-Za-z][A-Za-z0-9._-]{2,7}$/,
      true
    )
    const quotedAt = normalizeOptionalGmpayTimestamp(fields.quoted_at)
    const expiresAt = normalizeOptionalGmpayTimestamp(fields.expires_at)
    const estimatorVersion = normalizeOptionalGmpayIdentifier(
      fields.estimator_version,
      /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/
    )
    const confidence = normalizeOptionalGmpayIdentifier(
      fields.confidence,
      /^[A-Za-z][A-Za-z0-9._-]{0,31}$/
    )
    const subsidized = fields.subsidized
    const evidence = normalizeOptionalGmpayEvidence(fields.evidence)
    if (
      baseAmount === null ||
      feeAmount === null ||
      totalAmount === null ||
      feeSource === null ||
      nativeAmount === null ||
      nativeAsset === null ||
      settlementCurrency === null ||
      quotedAt === null ||
      expiresAt === null ||
      estimatorVersion === null ||
      confidence === null ||
      evidence === null ||
      (subsidized !== undefined && typeof subsidized !== 'boolean')
    ) {
      return null
    }

    if (quotedAt !== undefined && expiresAt !== undefined) {
      const quotedAtMs = gmpayTimestampToMilliseconds(quotedAt)
      const expiresAtMs = gmpayTimestampToMilliseconds(expiresAt)
      if (quotedAtMs === null || expiresAtMs === null) {
        return null
      }
      if (expiresAtMs <= quotedAtMs) {
        return null
      }
    }

    const gatewayTradeNo = fields.gateway_trade_no
    return {
      trade_no: tradeNo.trim(),
      ...(typeof gatewayTradeNo === 'string' && gatewayTradeNo.trim()
        ? { gateway_trade_no: gatewayTradeNo.trim() }
        : {}),
      checkout_type: 'crypto',
      payment_method: paymentMethod.trim(),
      money: String(money),
      actual_amount: actualAmount.trim(),
      receive_address: receiveAddress.trim(),
      token: token.trim().toUpperCase(),
      network: network.trim().toUpperCase(),
      expiration_time: expirationTime,
      ...(typeof serverTime === 'number' ? { server_time: serverTime } : {}),
      ...(baseAmount !== undefined ? { base_amount: baseAmount } : {}),
      ...(feeAmount !== undefined ? { fee_amount: feeAmount } : {}),
      ...(totalAmount !== undefined ? { total_amount: totalAmount } : {}),
      ...(feeSource !== undefined ? { fee_source: feeSource } : {}),
      ...(nativeAmount !== undefined ? { native_amount: nativeAmount } : {}),
      ...(nativeAsset !== undefined ? { native_asset: nativeAsset } : {}),
      ...(settlementCurrency !== undefined
        ? { settlement_currency: settlementCurrency }
        : {}),
      ...(quotedAt !== undefined ? { quoted_at: quotedAt } : {}),
      ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
      ...(estimatorVersion !== undefined
        ? { estimator_version: estimatorVersion }
        : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(subsidized !== undefined ? { subsidized } : {}),
      ...(evidence !== undefined ? { evidence } : {}),
    }
  }

  let checkoutType = fields.checkout_type
  let checkoutValue = fields.checkout_value
  if (!checkoutType && typeof fields.pay_url === 'string') {
    checkoutType = 'payurl'
    checkoutValue = fields.pay_url
  } else if (!checkoutType && typeof fields.payurl === 'string') {
    checkoutType = 'payurl'
    checkoutValue = fields.payurl
  } else if (!checkoutType && typeof fields.qr_code === 'string') {
    checkoutType = 'qrcode'
    checkoutValue = fields.qr_code
  }
  if (
    (checkoutType !== 'qrcode' &&
      checkoutType !== 'payurl' &&
      checkoutType !== 'urlscheme') ||
    typeof checkoutValue !== 'string' ||
    !checkoutValue.trim()
  ) {
    return null
  }
  if (
    checkoutType !== 'qrcode' &&
    !isSafeEpayCheckoutTarget(checkoutType, checkoutValue, paymentMethod.trim())
  ) {
    return null
  }
  const gatewayTradeNo = fields.gateway_trade_no
  return {
    trade_no: tradeNo.trim(),
    ...(typeof gatewayTradeNo === 'string' && gatewayTradeNo.trim()
      ? { gateway_trade_no: gatewayTradeNo.trim() }
      : {}),
    checkout_type: checkoutType,
    checkout_value: checkoutValue.trim(),
    payment_method: paymentMethod.trim(),
    money: String(money),
  }
}

export function openEpayCheckout(
  value: unknown,
  fallback: EpayCheckoutFallback,
  setCheckout: (checkout: EpayCheckoutData) => void
): boolean {
  const checkout = getEpayCheckoutData(value, fallback)
  if (!checkout) return false
  setCheckout(checkout)
  return true
}

export const openWalletEpayCheckout = openEpayCheckout
export const openSubscriptionEpayCheckout = openEpayCheckout
export const openGroupBuyEpayCheckout = openEpayCheckout

/**
 * Check if payment method is Stripe
 */
export function isStripePayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.STRIPE
}

/**
 * Check if payment method is the direct Alipay merchant integration.
 *
 * Distinct from PAYMENT_TYPES.ALIPAY, which is the Alipay channel offered by
 * an epay aggregator and goes through the generic /api/user/pay form flow.
 */
export function isAlipayDirectPayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.ALIPAY_DIRECT
}

/**
 * Check if payment method is the direct WeChat Pay merchant integration.
 *
 * Distinct from PAYMENT_TYPES.WECHAT, which is an epay aggregator channel.
 */
export function isWechatDirectPayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.WECHAT_DIRECT
}

/** Native GMPay payment methods use the `usdt.<network>` identifier. */
export function isCryptoPayment(paymentType: string): boolean {
  return paymentType.toLowerCase().startsWith('usdt.')
}

/**
 * Native GMPay is identified by the asset capability returned with top-up
 * info. Legacy EPay may still expose `usdt.tron`, but intentionally omits
 * `crypto_assets` and must continue through its existing confirmation flow.
 */
export function isNativeCryptoPayment(
  paymentType: string,
  topupInfo: TopupInfo | null | undefined
): boolean {
  return isCryptoPayment(paymentType) && Array.isArray(topupInfo?.crypto_assets)
}

/**
 * Check if payment method is Waffo
 */
export function isWaffoPayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.WAFFO
}

/**
 * Check if payment method is Waffo Pancake
 *
 * Pancake is a metered-style payment that goes through a dedicated checkout
 * URL flow rather than the generic epay form submission, so it must be
 * special-cased in payment dispatch logic.
 */
export function isWaffoPancakePayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.WAFFO_PANCAKE
}

export interface PaymentProcessors {
  regular: (topupAmount: number, paymentType: string) => Promise<boolean>
  waffo: (topupAmount: number, payMethodIndex: number) => Promise<boolean>
  waffoPancake: (topupAmount: number) => Promise<boolean>
  alipay: (topupAmount: number) => Promise<boolean>
  wechat: (topupAmount: number) => Promise<boolean>
}

export async function dispatchSelectedPayment(
  paymentMethod: PaymentMethod,
  topupAmount: number,
  waffoMethodIndex: number | null,
  processors: PaymentProcessors
): Promise<boolean> {
  if (isWaffoPayment(paymentMethod.type)) {
    if (waffoMethodIndex === null) {
      return false
    }
    return processors.waffo(topupAmount, waffoMethodIndex)
  }

  if (isWaffoPancakePayment(paymentMethod.type)) {
    return processors.waffoPancake(topupAmount)
  }

  if (isAlipayDirectPayment(paymentMethod.type)) {
    return processors.alipay(topupAmount)
  }

  if (isWechatDirectPayment(paymentMethod.type)) {
    return processors.wechat(topupAmount)
  }

  return processors.regular(topupAmount, paymentMethod.type)
}

/**
 * Whether the standard amount and payment-method controls should be shown.
 */
export function hasConfigurableTopup(topupInfo: TopupInfo | null): boolean {
  return Boolean(
    topupInfo?.enable_online_topup ||
    topupInfo?.enable_stripe_topup ||
    topupInfo?.enable_alipay_topup ||
    topupInfo?.enable_wechatpay_topup ||
    topupInfo?.enable_waffo_topup ||
    topupInfo?.enable_waffo_pancake_topup
  )
}

/**
 * Get default payment type from topup info
 */
export function getDefaultPaymentType(topupInfo: TopupInfo | null): string {
  if (!topupInfo) {
    return DEFAULT_PAYMENT_TYPE
  }

  // Return first available payment method or default
  if (topupInfo.pay_methods?.length > 0) {
    return topupInfo.pay_methods[0].type
  }

  if (topupInfo.enable_stripe_topup) {
    return PAYMENT_TYPES.STRIPE
  }

  if (topupInfo.enable_waffo_topup) {
    return PAYMENT_TYPES.WAFFO
  }

  if (topupInfo.enable_waffo_pancake_topup) {
    return PAYMENT_TYPES.WAFFO_PANCAKE
  }

  if (topupInfo.enable_alipay_topup) {
    return PAYMENT_TYPES.ALIPAY_DIRECT
  }

  if (topupInfo.enable_wechatpay_topup) {
    return PAYMENT_TYPES.WECHAT_DIRECT
  }

  return DEFAULT_PAYMENT_TYPE
}

/**
 * Get minimum topup amount from topup info
 */
export function getMinTopupAmount(topupInfo: TopupInfo | null): number {
  if (!topupInfo) {
    return DEFAULT_MIN_TOPUP
  }

  if (topupInfo.enable_online_topup) {
    return topupInfo.min_topup
  }

  if (topupInfo.enable_stripe_topup) {
    return topupInfo.stripe_min_topup
  }

  if (topupInfo.enable_waffo_topup) {
    return topupInfo.waffo_min_topup || DEFAULT_MIN_TOPUP
  }

  if (topupInfo.enable_waffo_pancake_topup) {
    return topupInfo.waffo_pancake_min_topup || DEFAULT_MIN_TOPUP
  }

  // Direct Alipay is validated server-side against the global minimum, not
  // alipay_min_topup — that one is advertised per method and enforced by the
  // per-button floor.
  if (topupInfo.enable_alipay_topup) {
    return topupInfo.min_topup || DEFAULT_MIN_TOPUP
  }

  if (topupInfo.enable_wechatpay_topup) {
    return topupInfo.min_topup || DEFAULT_MIN_TOPUP
  }

  return DEFAULT_MIN_TOPUP
}

/**
 * Get the maximum amount allowed for a single topup.
 *
 * The server caps a single topup at the highest configured preset; mirroring that
 * here keeps the user from typing an amount the payment gateway will only reject
 * with an opaque failure. Falls back to the highest preset when the server is
 * older than this field, and to no cap at all when neither is available.
 */
export function getMaxTopupAmount(topupInfo: TopupInfo | null): number | null {
  if (!topupInfo) {
    return null
  }
  if (typeof topupInfo.max_topup === 'number' && topupInfo.max_topup > 0) {
    return topupInfo.max_topup
  }
  const highestPreset = Math.max(0, ...(topupInfo.amount_options || []))
  return highestPreset > 0 ? highestPreset : null
}

/**
 * Generate preset amounts based on minimum topup
 */
export function generatePresetAmounts(minAmount: number): PresetAmount[] {
  return DEFAULT_PRESET_MULTIPLIERS.map((multiplier) => ({
    value: minAmount * multiplier,
  }))
}

/**
 * Merge custom preset amounts with discounts
 */
export function mergePresetAmounts(
  amountOptions: number[],
  discounts: Record<number, number>
): PresetAmount[] {
  if (!amountOptions || amountOptions.length === 0) {
    return []
  }

  return amountOptions.map((amount) => ({
    value: amount,
    discount: discounts[amount] || 1.0,
  }))
}
