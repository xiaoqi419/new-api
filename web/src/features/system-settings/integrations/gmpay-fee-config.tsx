/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/* eslint-disable react/only-export-components -- this editor intentionally
   exports its schema helpers alongside the React component for shared form
   validation and serialization. */

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * GMPay's public API does not expose a fee quote. This option therefore keeps
 * the estimator and the explicitly opt-in administrator fallback in one
 * versioned, server-validated document. Endpoint values are administrator
 * configuration only; checkout requests cannot supply URLs or credentials.
 */

export type GMPayFeeMode = 'fixed' | 'percent'
export type GMPayEstimatorMode = 'auto' | 'tron' | 'evm' | 'solana'
export type GMPayNetwork = 'tron' | 'ethereum' | 'binance' | 'solana'

export type GMPayFeeRule = {
  mode: GMPayFeeMode
  value: string
}

export type GMPayTransactionContext = {
  from?: string
  to?: string
  recipient?: string
  token_contract?: string
  contract?: string
  token_mint?: string
  mint?: string
  data?: string
  calldata?: string
  function_selector?: string
  payer?: string
  source_token_account?: string
  recipient_token_account?: string
  transfer_instruction?: string
  transfer_amount_base_units?: string
  token_decimals?: number
  recent_blockhash?: string
  token_program_id?: string
  message?: string
  batch?: boolean
  bandwidth_bytes?: number
  compute_units?: number
  priority_fee_per_unit?: string
  priority_fee_lamports?: string
}

export type GMPayCanonicalChainConfig = {
  rpc_url: string
  price_url: string
  /** Optional additional price endpoints; price_url remains the first source. */
  price_urls?: string[]
  native_asset: string
  settlement_currency: string
  rpc_allowed_hosts: string[]
  price_allowed_hosts: string[]
  transaction: GMPayTransactionContext
}

export type GMPayFeeConfig = {
  version: 1
  dynamic_enabled: boolean
  estimator_mode: GMPayEstimatorMode
  rpc_references: Record<GMPayNetwork, string>
  price_source_references: Record<GMPayNetwork, string>
  /** Canonical ordered price sources, including the legacy first reference. */
  price_source_lists: Partial<Record<GMPayNetwork, string[]>>
  request_timeout_ms: number
  cache_ttl_seconds: number
  quote_ttl_seconds: number
  response_body_limit_bytes: number
  max_retries: number
  price_max_age_seconds: number
  max_price_deviation_percent: string
  contexts: Partial<Record<GMPayNetwork, GMPayTransactionContext>>
  rpc_allowed_hosts: Partial<Record<GMPayNetwork, string[]>>
  price_allowed_hosts: Partial<Record<GMPayNetwork, string[]>>
  fallback_enabled: boolean
  fallback_mode: GMPayFeeMode
  default: GMPayFeeRule
  overrides: Record<string, GMPayFeeRule>
  max_fee: string
  max_total: string
  /** Legacy alias retained for callers that still inspect the old shape. */
  enabled: boolean
}

export type GMPayDiscoveryNetwork = {
  network: string
  tokens: string[]
}

export type GMPayDiscoveryStatus = {
  state: 'idle' | 'syncing' | 'ready' | 'unavailable' | 'error'
  networks?: GMPayDiscoveryNetwork[]
  lastSyncedAt?: string
  lastSuccessAt?: string
  lastEstimate?: {
    network: string
    token: string
    feeAmount?: string
    nativeAmount?: string
    nativeAsset?: string
    settlementCurrency?: string
    quotedAt?: string
    expiresAt?: string
  }
  error?: string
}

export const GMPAY_NETWORKS: readonly GMPayNetwork[] = [
  'tron',
  'ethereum',
  'binance',
  'solana',
]

const NETWORK_ALIASES: Record<string, GMPayNetwork> = {
  tron: 'tron',
  trc20: 'tron',
  'trc-20': 'tron',
  ethereum: 'ethereum',
  eth: 'ethereum',
  erc20: 'ethereum',
  'erc-20': 'ethereum',
  binance: 'binance',
  bsc: 'binance',
  bnb: 'binance',
  bep20: 'binance',
  'bep-20': 'binance',
  solana: 'solana',
  sol: 'solana',
  spl: 'solana',
}

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/
const OVERRIDE_KEY_PATTERN = /^(USDT|USDC):[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/i
const MAX_FEE = 1_000_000_000
const MAX_TOTAL = 1_000_000_000
const MAX_REFERENCE_LENGTH = 2048
const MAX_PRICE_SOURCES = 8
const MAX_HOST_LENGTH = 253
const MAX_CONTEXT_VALUE_LENGTH = 4096
const MAX_CONTEXT_INTEGER = Number.MAX_SAFE_INTEGER
const MAX_SOLANA_TOKEN_DECIMALS = 18
const SOLANA_TRANSFER_INSTRUCTIONS = new Set(['transfer', 'transferChecked'])
const TRON_FUNCTION_SELECTOR_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*\([A-Za-z0-9_,\s[\]]+\)$/
const SOLANA_TRANSFER_AMOUNT_PATTERN = /^[0-9]+$/
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

const FEE_CONFIG_KEYS = new Set([
  'version',
  // New dynamic estimator schema.
  'dynamic_enabled',
  'estimator_mode',
  'rpc_references',
  'price_source_references',
  'timeout_ms',
  'max_response_bytes',
  'request_timeout_ms',
  'cache_ttl_seconds',
  'quote_ttl_seconds',
  'response_body_limit_bytes',
  'max_retries',
  'price_max_age_seconds',
  'max_price_deviation_percent',
  'contexts',
  'chains',
  'fallback_enabled',
  'fallback_mode',
  'fallback_value',
  // Shared fallback fields.
  'default',
  'overrides',
  'max_fee',
  'max_total',
  // Previous fallback-only schema.
  'enabled',
])

const RULE_KEYS = new Set(['mode', 'value'])
const CONTEXT_KEYS = new Set([
  'from',
  'to',
  'recipient',
  'token_contract',
  'contract',
  'token_mint',
  'mint',
  'data',
  'calldata',
  'function_selector',
  'payer',
  'source_token_account',
  'recipient_token_account',
  'transfer_instruction',
  'transfer_amount_base_units',
  'token_decimals',
  'recent_blockhash',
  'token_program_id',
  'message',
  'batch',
  'bandwidth_bytes',
  'compute_units',
  'priority_fee_per_unit',
  'priority_fee_lamports',
])

const CONTEXT_STRING_KEYS = new Set([
  'from',
  'to',
  'recipient',
  'token_contract',
  'contract',
  'token_mint',
  'mint',
  'data',
  'calldata',
  'function_selector',
  'payer',
  'source_token_account',
  'recipient_token_account',
  'transfer_instruction',
  'transfer_amount_base_units',
  'recent_blockhash',
  'token_program_id',
  'message',
  'priority_fee_per_unit',
  'priority_fee_lamports',
])

const CONTEXT_INTEGER_KEYS = new Set([
  'bandwidth_bytes',
  'compute_units',
  'token_decimals',
])

const CANONICAL_CHAIN_KEYS = new Set([
  'rpc_url',
  'price_url',
  'price_urls',
  'native_asset',
  'settlement_currency',
  'rpc_allowed_hosts',
  'price_allowed_hosts',
  'transaction',
])

const NATIVE_ASSETS: Record<GMPayNetwork, string> = {
  tron: 'TRX',
  ethereum: 'ETH',
  binance: 'BNB',
  solana: 'SOL',
}

const DEFAULT_REFERENCES = {
  tron: '',
  ethereum: '',
  binance: '',
  solana: '',
} satisfies Record<GMPayNetwork, string>

export const DEFAULT_GMPAY_FEE_CONFIG: GMPayFeeConfig = {
  version: 1,
  dynamic_enabled: false,
  estimator_mode: 'auto',
  rpc_references: { ...DEFAULT_REFERENCES },
  price_source_references: { ...DEFAULT_REFERENCES },
  price_source_lists: {},
  request_timeout_ms: 5000,
  cache_ttl_seconds: 15,
  quote_ttl_seconds: 60,
  response_body_limit_bytes: 65536,
  max_retries: 1,
  price_max_age_seconds: 120,
  max_price_deviation_percent: '25.00',
  contexts: {},
  rpc_allowed_hosts: {},
  price_allowed_hosts: {},
  fallback_enabled: false,
  fallback_mode: 'fixed',
  default: { mode: 'fixed', value: '0.00' },
  overrides: {},
  max_fee: '20.00',
  max_total: '100000.00',
  // Keep the old field visible to existing consumers. The serializer only
  // emits it when the input document was using the legacy schema.
  enabled: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteInteger(value: unknown, min: number, max: number) {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  )
}

function isDecimalString(value: unknown, maximum: number, allowZero = true) {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) return false
  const number = Number(value)
  if (!Number.isFinite(number) || number > maximum) return false
  return allowZero || number > 0
}

function normalizeNetwork(value: string): GMPayNetwork | null {
  return NETWORK_ALIASES[value.trim().toLowerCase()] ?? null
}

function normalizeReferenceMap(value: unknown) {
  const result = { ...DEFAULT_REFERENCES }
  if (!isRecord(value)) return result
  for (const [rawNetwork, reference] of Object.entries(value)) {
    const network = normalizeNetwork(rawNetwork)
    if (network && typeof reference === 'string') result[network] = reference
  }
  return result
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is string =>
      typeof item === 'string' && item.length <= MAX_HOST_LENGTH
  )
}

function normalizePriceSourceList(value: unknown) {
  if (!Array.isArray(value)) return []
  const sources: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const source = item.trim()
    if (
      !source ||
      source.length > MAX_REFERENCE_LENGTH ||
      sources.includes(source)
    ) {
      continue
    }
    sources.push(source)
  }
  return sources
}

function getPriceSources(
  config: Pick<
    GMPayFeeConfig,
    'price_source_references' | 'price_source_lists'
  >,
  network: GMPayNetwork
) {
  const primary = config.price_source_references[network]?.trim() ?? ''
  const configured = config.price_source_lists[network] ?? []
  return normalizePriceSourceList([primary, ...configured])
}

function parsePriceSourceListInput(value: string) {
  return normalizePriceSourceList(value.split(/[\n,]/))
}

function formatPriceSourceListInput(value: string[] | undefined) {
  return value?.join(', ') ?? ''
}

function getEndpointHost(value: string) {
  try {
    const endpoint = new URL(value.trim())
    if (
      (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') ||
      !endpoint.hostname ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash
    ) {
      return null
    }
    return endpoint.hostname
  } catch {
    return null
  }
}

function validateEndpointReference(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    return `${label} must be a non-empty HTTP or HTTPS URL`
  }
  if (value.length > MAX_REFERENCE_LENGTH || !getEndpointHost(value)) {
    return `${label} must be a valid HTTP or HTTPS URL`
  }
  return null
}

function normalizeTransactionContext(value: unknown) {
  const next: GMPayTransactionContext = {}
  if (!isRecord(value)) return next

  for (const [key, field] of Object.entries(value)) {
    if (!CONTEXT_KEYS.has(key)) continue
    if (key === 'batch') {
      if (typeof field === 'boolean') next.batch = field
      continue
    }
    if (CONTEXT_INTEGER_KEYS.has(key)) {
      if (isFiniteInteger(field, 0, MAX_CONTEXT_INTEGER)) {
        next[key as keyof GMPayTransactionContext] = field as never
      }
      continue
    }
    if (
      CONTEXT_STRING_KEYS.has(key) &&
      typeof field === 'string' &&
      field.length <= MAX_CONTEXT_VALUE_LENGTH
    ) {
      next[key as keyof GMPayTransactionContext] = field as never
    }
  }

  // The structured editor uses concise aliases while the estimator consumes
  // the canonical protocol names. Normalize either form into one draft.
  if (!next.to && typeof next.recipient === 'string') next.to = next.recipient
  if (!next.token_contract && typeof next.contract === 'string') {
    next.token_contract = next.contract
  }
  if (!next.token_mint && typeof next.mint === 'string') {
    next.token_mint = next.mint
  }
  if (!next.mint && typeof next.token_mint === 'string') {
    next.mint = next.token_mint
  }
  if (!next.calldata && typeof next.data === 'string') next.calldata = next.data
  if (!next.data && typeof next.calldata === 'string') next.data = next.calldata
  if (next.transfer_instruction === 'transfer_checked') {
    next.transfer_instruction = 'transferChecked'
  }
  return next
}

function normalizeContexts(value: unknown) {
  const result: Partial<Record<GMPayNetwork, GMPayTransactionContext>> = {}
  if (!isRecord(value)) return result
  for (const [rawNetwork, context] of Object.entries(value)) {
    const network = normalizeNetwork(rawNetwork)
    if (!network) continue
    const next = normalizeTransactionContext(context)
    if (Object.keys(next).length > 0) result[network] = next
  }
  return result
}

function normalizeCanonicalChains(value: unknown) {
  const rpcReferences = { ...DEFAULT_REFERENCES }
  const priceReferences = { ...DEFAULT_REFERENCES }
  const priceSources: Partial<Record<GMPayNetwork, string[]>> = {}
  const contexts: Partial<Record<GMPayNetwork, GMPayTransactionContext>> = {}
  const rpcAllowedHosts: Partial<Record<GMPayNetwork, string[]>> = {}
  const priceAllowedHosts: Partial<Record<GMPayNetwork, string[]>> = {}

  if (!isRecord(value)) {
    return {
      rpcReferences,
      priceReferences,
      priceSources,
      contexts,
      rpcAllowedHosts,
      priceAllowedHosts,
    }
  }

  for (const [rawNetwork, rawChain] of Object.entries(value)) {
    const network = normalizeNetwork(rawNetwork)
    if (!network || !isRecord(rawChain)) continue
    if (typeof rawChain.rpc_url === 'string') {
      rpcReferences[network] = rawChain.rpc_url
    }
    if (typeof rawChain.price_url === 'string') {
      priceReferences[network] = rawChain.price_url
    }
    const configuredPriceSources = normalizePriceSourceList(
      Array.isArray(rawChain.price_urls) ? rawChain.price_urls : []
    )
    const sources = normalizePriceSourceList([
      rawChain.price_url,
      ...configuredPriceSources,
    ])
    if (sources.length > 0) {
      priceSources[network] = sources
      if (!priceReferences[network]) priceReferences[network] = sources[0]
    }
    if (Array.isArray(rawChain.rpc_allowed_hosts)) {
      rpcAllowedHosts[network] = normalizeStringArray(
        rawChain.rpc_allowed_hosts
      )
    }
    if (Array.isArray(rawChain.price_allowed_hosts)) {
      priceAllowedHosts[network] = normalizeStringArray(
        rawChain.price_allowed_hosts
      )
    }
    const context = normalizeTransactionContext(rawChain.transaction)
    if (Object.keys(context).length > 0) contexts[network] = context
  }

  return {
    rpcReferences,
    priceReferences,
    priceSources,
    contexts,
    rpcAllowedHosts,
    priceAllowedHosts,
  }
}

function validateRule(
  value: unknown,
  maxFee: number,
  label: 'default' | 'override'
): string | null {
  if (!isRecord(value)) {
    return label === 'override'
      ? 'GMPay fee override must be a JSON object'
      : 'GMPay default fee must be a JSON object'
  }

  for (const key of Object.keys(value)) {
    if (!RULE_KEYS.has(key)) return 'GMPay fee rule contains an unknown field'
  }

  if (value.mode !== 'fixed' && value.mode !== 'percent') {
    return 'GMPay fee mode must be fixed or percent'
  }

  if (!isDecimalString(value.value, MAX_FEE)) {
    return 'GMPay fee value must be a non-negative decimal with up to 6 decimal places'
  }

  const numericValue = Number(value.value)
  if (value.mode === 'percent' && numericValue > 100) {
    return 'GMPay percentage fee must be between 0 and 100'
  }
  if (value.mode === 'fixed' && numericValue > maxFee) {
    return 'GMPay fixed fee exceeds max_fee'
  }
  return null
}

function validateReferenceMap(value: unknown, label: string) {
  if (!isRecord(value)) return `${label} must be a JSON object`
  for (const [network, reference] of Object.entries(value)) {
    if (!normalizeNetwork(network)) {
      return `${label} contains an unsupported network`
    }
    if (
      typeof reference !== 'string' ||
      reference.length > MAX_REFERENCE_LENGTH
    ) {
      return `${label} values must be short server-side references`
    }
  }
  return null
}

function validateContextObject(value: unknown) {
  if (!isRecord(value)) return 'GMPay transaction context must be a JSON object'
  for (const [key, field] of Object.entries(value)) {
    if (!CONTEXT_KEYS.has(key)) {
      return 'GMPay transaction context contains an unknown field'
    }
    if (key === 'batch') {
      if (typeof field !== 'boolean') {
        return 'GMPay transaction context batch must be a boolean'
      }
      continue
    }
    if (CONTEXT_INTEGER_KEYS.has(key)) {
      const maximum =
        key === 'token_decimals'
          ? MAX_SOLANA_TOKEN_DECIMALS
          : MAX_CONTEXT_INTEGER
      if (!isFiniteInteger(field, 0, maximum)) {
        return 'GMPay transaction context integer fields are out of bounds'
      }
      continue
    }
    if (
      !CONTEXT_STRING_KEYS.has(key) ||
      typeof field !== 'string' ||
      field.length > MAX_CONTEXT_VALUE_LENGTH
    ) {
      return 'GMPay transaction context values are too long'
    }

    if (key === 'function_selector') {
      const selector = field.trim()
      if (!TRON_FUNCTION_SELECTOR_PATTERN.test(selector)) {
        return 'GMPay TRON function selector must use a valid signature such as transfer(address,uint256)'
      }
    }

    if (key === 'transfer_instruction') {
      if (
        !SOLANA_TRANSFER_INSTRUCTIONS.has(field.trim()) &&
        field.trim() !== 'transfer_checked'
      ) {
        return 'GMPay Solana transfer instruction must be transfer or transferChecked'
      }
    }

    if (key === 'transfer_amount_base_units') {
      const amount = field.trim()
      if (
        !SOLANA_TRANSFER_AMOUNT_PATTERN.test(amount) ||
        amount.length > MAX_CONTEXT_VALUE_LENGTH
      ) {
        return 'GMPay Solana transfer amount must be a non-negative integer in base units'
      }
    }
  }
  return null
}

const SOLANA_STRUCTURED_CONTEXT_KEYS = [
  'payer',
  'source_token_account',
  'recipient_token_account',
  'token_mint',
  'transfer_instruction',
  'transfer_amount_base_units',
  'token_decimals',
  'recent_blockhash',
  'token_program_id',
] as const

// `payer`, `token_mint`, and `to` were already accepted by the v1 editor. A
// legacy context containing only those fields plus `message` must remain
// readable; the presence of any of the newly controlled transfer fields marks
// the context as structured and opts it into the stricter checks.
const SOLANA_NEW_STRUCTURED_CONTEXT_KEYS = [
  'source_token_account',
  'recipient_token_account',
  'transfer_instruction',
  'transfer_amount_base_units',
  'token_decimals',
  'recent_blockhash',
  'token_program_id',
] as const

function hasContextString(
  context: GMPayTransactionContext,
  key: keyof GMPayTransactionContext
) {
  const value = context[key]
  return typeof value === 'string' && value.trim() !== ''
}

function hasSolanaStructuredContext(context: GMPayTransactionContext) {
  return SOLANA_NEW_STRUCTURED_CONTEXT_KEYS.some((key) => {
    const value = context[key]
    return typeof value === 'number' || hasContextString(context, key)
  })
}

function isBase64Message(value: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_CONTEXT_VALUE_LENGTH) return false
  if (!BASE64_PATTERN.test(normalized) || normalized.length % 4 === 1) {
    return false
  }
  // Padding is only valid at the end and there can be at most two bytes of
  // padding. The RPC accepts both padded and raw base64 forms.
  const firstPadding = normalized.indexOf('=')
  return firstPadding < 0 || firstPadding >= normalized.length - 2
}

function validateRequiredContextFields(
  context: GMPayTransactionContext,
  keys: readonly (keyof GMPayTransactionContext)[],
  message: string
) {
  const missing = keys.filter((key) => {
    const value = context[key]
    if (typeof value === 'number') return !Number.isInteger(value)
    return !hasContextString(context, key)
  })
  return missing.length > 0 ? message : null
}

/**
 * Validate one representative transaction context from the administrator
 * editor. Empty contexts remain valid so an installation can keep dynamic
 * estimation disabled or use the explicit fallback policy. Once an operator
 * starts configuring a protocol context, the fields that make the quote
 * trustworthy are checked here before the option can be saved.
 */
export function getGMPayTransactionContextError(
  network: GMPayNetwork,
  value: unknown,
  options: { requireStructured?: boolean } = {}
): string | null {
  const context = normalizeTransactionContext(value)
  if (Object.keys(context).length === 0) return null

  const genericError = validateContextObject(context)
  if (genericError) return genericError

  if (network === 'tron') {
    const hasContractPayload =
      hasContextString(context, 'token_contract') ||
      hasContextString(context, 'contract') ||
      hasContextString(context, 'data') ||
      hasContextString(context, 'calldata')
    if (options.requireStructured || hasContractPayload) {
      return validateRequiredContextFields(
        context,
        ['from', 'to', 'token_contract', 'calldata', 'function_selector'],
        'GMPay TRON token transfer context requires sender, recipient, token contract, calldata, and function selector'
      )
    }
    return null
  }

  if (network !== 'solana') return null

  const hasLegacyMessage = hasContextString(context, 'message')
  const hasStructured = hasSolanaStructuredContext(context)
  if (!hasStructured && !hasLegacyMessage) return null

  if (!hasStructured && hasLegacyMessage) {
    return options.requireStructured
      ? 'GMPay Solana legacy message requires structured transfer fields so the message can be verified'
      : null
  }

  const structuredError = validateRequiredContextFields(
    context,
    SOLANA_STRUCTURED_CONTEXT_KEYS,
    'GMPay Solana context requires payer, source token account, recipient token account, token mint, transfer instruction, transfer amount, token decimals, recent blockhash, and token program ID'
  )
  if (structuredError && (options.requireStructured || hasStructured)) {
    return structuredError
  }

  if (
    hasLegacyMessage &&
    (options.requireStructured || hasStructured) &&
    !isBase64Message(context.message ?? '')
  ) {
    return 'GMPay Solana representative message must be valid base64'
  }

  return null
}

function validateContexts(value: unknown) {
  if (!isRecord(value)) {
    return 'GMPay transaction contexts must be a JSON object'
  }
  for (const [network, context] of Object.entries(value)) {
    if (!normalizeNetwork(network)) {
      return 'GMPay transaction contexts contain an unsupported network'
    }
    const error = validateContextObject(context)
    if (error) return error
  }
  return null
}

function validateHostList(value: unknown, label: string) {
  if (!Array.isArray(value)) return `${label} must be an array`
  for (const host of value) {
    if (
      typeof host !== 'string' ||
      host.trim() === '' ||
      host.length > MAX_HOST_LENGTH ||
      host.includes('://') ||
      /\s/.test(host)
    ) {
      return `${label} contains an invalid host`
    }
  }
  return null
}

function validateCanonicalChains(value: unknown) {
  if (!isRecord(value)) return 'GMPay chains must be a JSON object'
  const seen = new Set<GMPayNetwork>()
  for (const [rawNetwork, chain] of Object.entries(value)) {
    const network = normalizeNetwork(rawNetwork)
    if (!network) return 'GMPay chains contain an unsupported network'
    if (seen.has(network)) return 'GMPay chains contain a duplicate network'
    seen.add(network)
    if (!isRecord(chain)) return 'GMPay chain must be a JSON object'
    for (const key of Object.keys(chain)) {
      if (!CANONICAL_CHAIN_KEYS.has(key)) {
        return 'GMPay chain contains an unknown field'
      }
    }
    const rpcError = validateEndpointReference(
      chain.rpc_url,
      'GMPay chain rpc_url'
    )
    if (rpcError) return rpcError

    const hasLegacyPriceURL = Object.hasOwn(chain, 'price_url')
    const hasPriceURLs = Object.hasOwn(chain, 'price_urls')
    if (!hasLegacyPriceURL && !hasPriceURLs) {
      return 'GMPay chain price_url or price_urls must be configured'
    }
    if (hasLegacyPriceURL) {
      const error = validateEndpointReference(
        chain.price_url,
        'GMPay chain price_url'
      )
      if (error) return error
    }
    if (hasPriceURLs) {
      if (!Array.isArray(chain.price_urls)) {
        return 'GMPay chain price_urls must be an array'
      }
      if (
        chain.price_urls.length === 0 ||
        chain.price_urls.length > MAX_PRICE_SOURCES
      ) {
        return 'GMPay chain price_urls must contain between 1 and 8 sources'
      }
      for (const source of chain.price_urls) {
        const error = validateEndpointReference(
          source,
          'GMPay chain price_urls source'
        )
        if (error) return error
      }
    }
    if (
      Object.hasOwn(chain, 'native_asset') &&
      (typeof chain.native_asset !== 'string' ||
        chain.native_asset.trim().toUpperCase() !== NATIVE_ASSETS[network])
    ) {
      return `GMPay ${network} native asset is invalid`
    }
    if (
      Object.hasOwn(chain, 'settlement_currency') &&
      (typeof chain.settlement_currency !== 'string' ||
        !/^[A-Z][A-Z0-9]{2,7}$/.test(
          chain.settlement_currency.trim().toUpperCase()
        ))
    ) {
      return `GMPay ${network} settlement currency is invalid`
    }
    for (const key of ['rpc_allowed_hosts', 'price_allowed_hosts'] as const) {
      if (Object.hasOwn(chain, key)) {
        const error = validateHostList(chain[key], `GMPay ${network} ${key}`)
        if (error) return error
      }
    }
    if (Object.hasOwn(chain, 'transaction')) {
      const error = validateContextObject(chain.transaction)
      if (error) return error
    }
  }
  return null
}

function getNumberField(
  parsed: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number
) {
  if (!Object.hasOwn(parsed, key)) return fallback
  const value = parsed[key]
  return isFiniteInteger(value, min, max) ? value : null
}

function getReferenceMaps(parsed: Record<string, unknown>) {
  const canonical = normalizeCanonicalChains(parsed.chains)
  const rpcReferences = normalizeReferenceMap(parsed.rpc_references)
  const priceReferences = normalizeReferenceMap(parsed.price_source_references)
  const aliasContexts = normalizeContexts(parsed.contexts)
  const priceSources: Partial<Record<GMPayNetwork, string[]>> = {
    ...canonical.priceSources,
  }
  const contexts: Partial<Record<GMPayNetwork, GMPayTransactionContext>> = {}
  for (const network of GMPAY_NETWORKS) {
    if (!rpcReferences[network] && canonical.rpcReferences[network]) {
      rpcReferences[network] = canonical.rpcReferences[network]
    }
    if (canonical.priceSources[network]?.length) {
      priceSources[network] = canonical.priceSources[network]
      priceReferences[network] = canonical.priceSources[network][0]
    } else if (
      !priceReferences[network] &&
      canonical.priceReferences[network]
    ) {
      priceReferences[network] = canonical.priceReferences[network]
      priceSources[network] = [canonical.priceReferences[network]]
    } else if (priceReferences[network]) {
      priceSources[network] = [priceReferences[network]]
    }
    const context = {
      ...aliasContexts[network],
      ...canonical.contexts[network],
    }
    if (Object.keys(context).length > 0) contexts[network] = context
  }
  return {
    ...canonical,
    rpcReferences,
    priceReferences,
    priceSources,
    contexts,
  }
}

/**
 * Return a translated error key when the editor value is invalid. Empty input
 * is treated as the safe disabled configuration so an administrator can clear
 * the option without making other payment settings unsaveable.
 */
export function getGMPayFeeConfigError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return 'GMPay fee configuration must be valid JSON'
  }

  if (!isRecord(parsed)) {
    return 'GMPay fee configuration must be a JSON object'
  }

  for (const key of Object.keys(parsed)) {
    if (!FEE_CONFIG_KEYS.has(key)) {
      return 'GMPay fee configuration contains an unknown field'
    }
  }

  if (!Object.hasOwn(parsed, 'version') || parsed.version !== 1) {
    return 'GMPay fee configuration version must be 1'
  }

  for (const booleanKey of ['enabled', 'dynamic_enabled', 'fallback_enabled']) {
    if (
      Object.hasOwn(parsed, booleanKey) &&
      typeof parsed[booleanKey] !== 'boolean'
    ) {
      return `GMPay fee configuration ${booleanKey} must be a boolean`
    }
  }

  if (Object.hasOwn(parsed, 'estimator_mode')) {
    if (
      parsed.estimator_mode !== 'auto' &&
      parsed.estimator_mode !== 'tron' &&
      parsed.estimator_mode !== 'evm' &&
      parsed.estimator_mode !== 'solana'
    ) {
      return 'GMPay estimator mode is invalid'
    }
  }

  for (const [key, label] of [
    ['rpc_references', 'GMPay RPC references'],
    ['price_source_references', 'GMPay price source references'],
  ] as const) {
    if (Object.hasOwn(parsed, key)) {
      const error = validateReferenceMap(parsed[key], label)
      if (error) return error
    }
  }

  if (Object.hasOwn(parsed, 'chains')) {
    const error = validateCanonicalChains(parsed.chains)
    if (error) return error
  }

  const integerFields = [
    ['request_timeout_ms', 100, 30_000],
    ['timeout_ms', 100, 30_000],
    ['cache_ttl_seconds', 1, 86_400],
    ['quote_ttl_seconds', 1, 86_400],
    ['response_body_limit_bytes', 1024, 8 * 1024 * 1024],
    ['max_response_bytes', 1024, 8 * 1024 * 1024],
    ['max_retries', 0, 2],
    ['price_max_age_seconds', 1, 86_400],
  ] as const
  for (const [key, min, max] of integerFields) {
    const number = getNumberField(parsed, key, 0, min, max)
    if (number === null) return `GMPay ${key} is out of bounds`
  }

  for (const [canonicalKey, aliasKey] of [
    ['timeout_ms', 'request_timeout_ms'],
    ['max_response_bytes', 'response_body_limit_bytes'],
  ] as const) {
    if (
      Object.hasOwn(parsed, canonicalKey) &&
      Object.hasOwn(parsed, aliasKey) &&
      parsed[canonicalKey] !== parsed[aliasKey]
    ) {
      return `GMPay ${canonicalKey} and ${aliasKey} must match`
    }
  }

  const maxFeeValue = parsed.max_fee ?? DEFAULT_GMPAY_FEE_CONFIG.max_fee
  if (!isDecimalString(maxFeeValue, MAX_FEE)) {
    return 'GMPay max_fee must be a non-negative decimal with up to 6 decimal places'
  }
  const maxFee = Number(maxFeeValue)

  const maxTotalValue = parsed.max_total ?? DEFAULT_GMPAY_FEE_CONFIG.max_total
  if (!isDecimalString(maxTotalValue, MAX_TOTAL, false)) {
    return 'GMPay max_total must be a positive decimal with up to 6 decimal places'
  }

  if (Object.hasOwn(parsed, 'max_price_deviation_percent')) {
    if (!isDecimalString(parsed.max_price_deviation_percent, 100)) {
      return 'GMPay price deviation must be between 0 and 100'
    }
  }

  if (Object.hasOwn(parsed, 'fallback_value')) {
    if (!isDecimalString(parsed.fallback_value, maxFee)) {
      return 'GMPay fallback_value must be a non-negative decimal with up to 6 decimal places'
    }
    if (!Object.hasOwn(parsed, 'fallback_mode')) {
      return 'GMPay fallback_mode is required with fallback_value'
    }
  }

  if (Object.hasOwn(parsed, 'fallback_mode')) {
    if (
      parsed.fallback_mode !== 'fixed' &&
      parsed.fallback_mode !== 'percent'
    ) {
      return 'GMPay fee mode must be fixed or percent'
    }
  }

  if (Object.hasOwn(parsed, 'default')) {
    const error = validateRule(parsed.default, maxFee, 'default')
    if (error) return error
    if (
      Object.hasOwn(parsed, 'fallback_mode') &&
      isRecord(parsed.default) &&
      parsed.default.mode !== parsed.fallback_mode
    ) {
      return 'GMPay fallback mode must match the default rule'
    }
  }

  if (Object.hasOwn(parsed, 'overrides')) {
    if (!isRecord(parsed.overrides)) {
      return 'GMPay fee overrides must be a JSON object'
    }

    for (const [key, rule] of Object.entries(parsed.overrides)) {
      if (!OVERRIDE_KEY_PATTERN.test(key)) {
        return 'GMPay fee override key must use TOKEN:network format'
      }
      const [token, networkValue] = key.split(':')
      if (token.toUpperCase() !== 'USDT' && token.toUpperCase() !== 'USDC') {
        return 'GMPay fee override token must be USDT or USDC'
      }
      if (!normalizeNetwork(networkValue)) {
        return 'GMPay fee override network is unsupported'
      }
      const error = validateRule(rule, maxFee, 'override')
      if (error) return error
    }
  }

  if (Object.hasOwn(parsed, 'contexts')) {
    const error = validateContexts(parsed.contexts)
    if (error) return error
  }

  // Validate the protocol-specific context after aliases and canonical chain
  // entries have been merged. This keeps old `mint`/`recipient` aliases
  // readable while ensuring a newly edited dynamic context is complete and
  // verifiable before it is saved.
  const referenceMaps = getReferenceMaps(parsed)
  for (const network of GMPAY_NETWORKS) {
    const context = referenceMaps.contexts[network]
    if (!context) continue
    const contextError = getGMPayTransactionContextError(network, context, {
      requireStructured: parsed.dynamic_enabled === true,
    })
    if (contextError) return contextError
  }

  if (parsed.dynamic_enabled === true) {
    const { rpcReferences, priceReferences } = referenceMaps
    const completeNetworks = GMPAY_NETWORKS.filter(
      (network) => rpcReferences[network] && priceReferences[network]
    )
    const partialNetworks = GMPAY_NETWORKS.filter(
      (network) =>
        Boolean(rpcReferences[network]) !== Boolean(priceReferences[network])
    )
    if (partialNetworks.length > 0) {
      return 'GMPay dynamic fee configuration requires both RPC and price references for each configured network'
    }
    if (completeNetworks.length === 0) {
      return 'GMPay dynamic fee configuration requires at least one complete network reference pair'
    }
    for (const network of completeNetworks) {
      const rpcError = validateEndpointReference(
        rpcReferences[network],
        `GMPay ${network} RPC endpoint`
      )
      if (rpcError) return rpcError
      const priceError = validateEndpointReference(
        priceReferences[network],
        `GMPay ${network} price endpoint`
      )
      if (priceError) return priceError
    }
  }

  return null
}

export function isValidGMPayFeeConfig(value: string) {
  return getGMPayFeeConfigError(value) === null
}

function copyRule(value: unknown, fallback: GMPayFeeRule): GMPayFeeRule {
  if (!isRecord(value)) return { ...fallback }
  return {
    mode: value.mode === 'percent' ? 'percent' : 'fixed',
    value: typeof value.value === 'string' ? value.value : fallback.value,
  }
}

/**
 * Normalize both the new dynamic schema and the previous fallback-only schema
 * to the shape consumed by the structured editor. Unknown/invalid input is
 * deliberately returned as null so the parent form can surface validation.
 */
export function parseGMPayFeeConfig(value: string): GMPayFeeConfig | null {
  if (!isValidGMPayFeeConfig(value)) return null

  const trimmed = value.trim()
  if (!trimmed) return { ...DEFAULT_GMPAY_FEE_CONFIG, overrides: {} }

  const parsed = JSON.parse(trimmed) as Record<string, unknown>
  const parsedDefaultRule = copyRule(
    parsed.default,
    DEFAULT_GMPAY_FEE_CONFIG.default
  )
  const fallbackEnabled =
    typeof parsed.fallback_enabled === 'boolean'
      ? parsed.fallback_enabled
      : parsed.enabled === true
  const fallbackMode =
    parsed.fallback_mode === 'percent' || parsed.fallback_mode === 'fixed'
      ? parsed.fallback_mode
      : parsedDefaultRule.mode
  const defaultRule = Object.hasOwn(parsed, 'default')
    ? parsedDefaultRule
    : {
        mode: fallbackMode,
        value:
          typeof parsed.fallback_value === 'string'
            ? parsed.fallback_value
            : parsedDefaultRule.value,
      }
  const overrides: Record<string, GMPayFeeRule> = {}
  if (isRecord(parsed.overrides)) {
    for (const [key, rule] of Object.entries(parsed.overrides)) {
      const [token, networkValue] = key.split(':')
      const network = normalizeNetwork(networkValue)
      if (network) {
        overrides[`${token.toLowerCase()}:${network}`] = copyRule(
          rule,
          defaultRule
        )
      }
    }
  }

  const canonical = normalizeCanonicalChains(parsed.chains)
  const rpcReferences = normalizeReferenceMap(parsed.rpc_references)
  const priceSourceReferences = normalizeReferenceMap(
    parsed.price_source_references
  )
  const priceSourceLists: Partial<Record<GMPayNetwork, string[]>> = {
    ...canonical.priceSources,
  }
  for (const network of GMPAY_NETWORKS) {
    if (!rpcReferences[network] && canonical.rpcReferences[network]) {
      rpcReferences[network] = canonical.rpcReferences[network]
    }
    if (canonical.priceSources[network]?.length) {
      priceSourceReferences[network] = canonical.priceSources[network][0]
      priceSourceLists[network] = canonical.priceSources[network]
    } else if (
      !priceSourceReferences[network] &&
      canonical.priceReferences[network]
    ) {
      priceSourceReferences[network] = canonical.priceReferences[network]
      priceSourceLists[network] = [canonical.priceReferences[network]]
    } else if (priceSourceReferences[network]) {
      priceSourceLists[network] = [priceSourceReferences[network]]
    }
  }
  const aliasContexts = normalizeContexts(parsed.contexts)
  const contexts: Partial<Record<GMPayNetwork, GMPayTransactionContext>> = {}
  for (const network of GMPAY_NETWORKS) {
    const context = {
      ...aliasContexts[network],
      ...canonical.contexts[network],
    }
    if (Object.keys(context).length > 0) contexts[network] = context
  }

  const readNumber = (keys: string[], fallback: number) => {
    for (const key of keys) {
      if (typeof parsed[key] === 'number') return parsed[key] as number
    }
    return fallback
  }

  return {
    version: 1,
    dynamic_enabled:
      typeof parsed.dynamic_enabled === 'boolean'
        ? parsed.dynamic_enabled
        : false,
    estimator_mode:
      parsed.estimator_mode === 'tron' ||
      parsed.estimator_mode === 'evm' ||
      parsed.estimator_mode === 'solana'
        ? parsed.estimator_mode
        : 'auto',
    rpc_references: rpcReferences,
    price_source_references: priceSourceReferences,
    price_source_lists: priceSourceLists,
    request_timeout_ms: readNumber(
      ['timeout_ms', 'request_timeout_ms'],
      DEFAULT_GMPAY_FEE_CONFIG.request_timeout_ms
    ),
    cache_ttl_seconds:
      typeof parsed.cache_ttl_seconds === 'number'
        ? parsed.cache_ttl_seconds
        : DEFAULT_GMPAY_FEE_CONFIG.cache_ttl_seconds,
    quote_ttl_seconds: readNumber(
      ['quote_ttl_seconds'],
      DEFAULT_GMPAY_FEE_CONFIG.quote_ttl_seconds
    ),
    response_body_limit_bytes: readNumber(
      ['max_response_bytes', 'response_body_limit_bytes'],
      DEFAULT_GMPAY_FEE_CONFIG.response_body_limit_bytes
    ),
    max_retries:
      typeof parsed.max_retries === 'number'
        ? parsed.max_retries
        : DEFAULT_GMPAY_FEE_CONFIG.max_retries,
    price_max_age_seconds: readNumber(
      ['price_max_age_seconds'],
      DEFAULT_GMPAY_FEE_CONFIG.price_max_age_seconds
    ),
    max_price_deviation_percent:
      typeof parsed.max_price_deviation_percent === 'string'
        ? parsed.max_price_deviation_percent
        : DEFAULT_GMPAY_FEE_CONFIG.max_price_deviation_percent,
    contexts,
    rpc_allowed_hosts: canonical.rpcAllowedHosts,
    price_allowed_hosts: canonical.priceAllowedHosts,
    fallback_enabled: fallbackEnabled,
    fallback_mode: fallbackMode,
    default: defaultRule,
    overrides,
    max_fee:
      typeof parsed.max_fee === 'string'
        ? parsed.max_fee
        : DEFAULT_GMPAY_FEE_CONFIG.max_fee,
    max_total:
      typeof parsed.max_total === 'string'
        ? parsed.max_total
        : DEFAULT_GMPAY_FEE_CONFIG.max_total,
    enabled: fallbackEnabled,
  }
}

function cleanReferences(value: Record<GMPayNetwork, string>) {
  const output: Record<string, string> = {}
  for (const network of GMPAY_NETWORKS) {
    const reference = value[network]?.trim()
    if (reference) output[network] = reference
  }
  return output
}

function cleanPriceReferences(config: GMPayFeeConfig) {
  const output: Record<string, string> = {}
  for (const network of GMPAY_NETWORKS) {
    const source = getPriceSources(config, network)[0]
    if (source) output[network] = source
  }
  return output
}

function cleanContexts(
  value: Partial<Record<GMPayNetwork, GMPayTransactionContext>>
) {
  const output: Record<string, GMPayTransactionContext> = {}
  for (const network of GMPAY_NETWORKS) {
    const context = value[network]
    if (!context) continue
    const next = cleanCanonicalTransaction(context)
    if (Object.keys(next).length > 0) output[network] = next
  }
  return output
}

function cleanCanonicalTransaction(value: GMPayTransactionContext) {
  const context = normalizeTransactionContext(value)
  const output: GMPayTransactionContext = {}
  const copyString = (
    target: keyof GMPayTransactionContext,
    source: keyof GMPayTransactionContext = target
  ) => {
    const field = context[source]
    if (typeof field === 'string' && field.trim()) {
      output[target] = field.trim() as never
    }
  }

  copyString('from')
  copyString('payer')
  copyString('to', 'to')
  if (!output.to) copyString('to', 'recipient')
  copyString('token_contract')
  if (!output.token_contract) copyString('token_contract', 'contract')
  copyString('token_mint')
  if (!output.token_mint) copyString('token_mint', 'mint')
  copyString('source_token_account')
  copyString('recipient_token_account')
  copyString('transfer_instruction')
  copyString('transfer_amount_base_units')
  copyString('recent_blockhash')
  copyString('token_program_id')
  copyString('calldata')
  if (!output.calldata) copyString('calldata', 'data')
  copyString('message')
  copyString('function_selector')
  copyString('priority_fee_per_unit')
  copyString('priority_fee_lamports')
  if (context.bandwidth_bytes && context.bandwidth_bytes > 0) {
    output.bandwidth_bytes = context.bandwidth_bytes
  }
  if (context.compute_units && context.compute_units > 0) {
    output.compute_units = context.compute_units
  }
  if (
    typeof context.token_decimals === 'number' &&
    Number.isInteger(context.token_decimals) &&
    context.token_decimals >= 0 &&
    context.token_decimals <= MAX_SOLANA_TOKEN_DECIMALS
  ) {
    output.token_decimals = context.token_decimals
  }
  if (context.batch === true) output.batch = true
  return output
}

function cleanHostMap(
  value: Partial<Record<GMPayNetwork, string[]>> | undefined,
  network: GMPayNetwork,
  endpoints: string | string[]
) {
  const hosts = value?.[network]
  const configuredHosts = Array.isArray(hosts)
    ? hosts
        .filter(
          (host): host is string =>
            typeof host === 'string' && host.trim().length > 0
        )
        .map((host) => host.trim())
    : []
  if (configuredHosts.length > 0) return configuredHosts
  const endpointValues = Array.isArray(endpoints) ? endpoints : [endpoints]
  const endpointHosts = endpointValues
    .map((endpoint) => getEndpointHost(endpoint))
    .filter((host): host is string => Boolean(host))
  return [...new Set(endpointHosts)]
}

function buildCanonicalChains(config: GMPayFeeConfig) {
  const chains: Record<string, GMPayCanonicalChainConfig> = {}
  const contexts = cleanContexts(config.contexts)
  for (const network of GMPAY_NETWORKS) {
    const rpcURL = config.rpc_references[network]?.trim()
    const priceSources = getPriceSources(config, network)
    const priceURL = priceSources[0]
    // A partial pair is kept in the editor aliases but cannot be emitted as a
    // chain: the backend requires both endpoints before constructing an
    // estimator. The form validator reports the incomplete pair when dynamic
    // estimation is enabled.
    if (!rpcURL || !priceURL) continue
    const chain: GMPayCanonicalChainConfig = {
      rpc_url: rpcURL,
      price_url: priceURL,
      native_asset: NATIVE_ASSETS[network],
      settlement_currency: 'USD',
      rpc_allowed_hosts: cleanHostMap(
        config.rpc_allowed_hosts,
        network,
        rpcURL
      ),
      price_allowed_hosts: cleanHostMap(
        config.price_allowed_hosts,
        network,
        priceSources
      ),
      transaction: cleanCanonicalTransaction(
        contexts[network] ?? config.contexts[network] ?? {}
      ),
    }
    if (priceSources.length > 1) chain.price_urls = priceSources
    chains[network] = chain
  }
  return chains
}

function cleanOverrides(value: Record<string, GMPayFeeRule>) {
  const output: Record<string, GMPayFeeRule> = {}
  for (const [key, rule] of Object.entries(value)) {
    const [token, rawNetwork] = key.split(':')
    const network = normalizeNetwork(rawNetwork)
    const normalizedToken = token.toUpperCase()
    if (
      !network ||
      (normalizedToken !== 'USDT' && normalizedToken !== 'USDC')
    ) {
      continue
    }
    output[`${normalizedToken}:${network}`] = {
      mode: rule.mode,
      value: rule.value.trim(),
    }
  }
  return output
}

export type SerializeGMPayFeeConfigOptions = {
  /** Include the old `enabled` alias when editing a legacy document. */
  includeLegacyEnabled?: boolean
}

/** Serialize only the controlled schema; no arbitrary JSON can reach Option. */
export function serializeGMPayFeeConfig(
  config: GMPayFeeConfig,
  options: SerializeGMPayFeeConfigOptions = {}
) {
  const contexts = cleanContexts(config.contexts)
  const serialized: Record<string, unknown> = {
    version: 1,
    estimator_mode: config.estimator_mode,
    rpc_references: cleanReferences(config.rpc_references),
    price_source_references: cleanPriceReferences(config),
    chains: buildCanonicalChains(config),
    timeout_ms: config.request_timeout_ms,
    max_response_bytes: config.response_body_limit_bytes,
    quote_ttl_seconds: config.quote_ttl_seconds,
    price_max_age_seconds: config.price_max_age_seconds,
    request_timeout_ms: config.request_timeout_ms,
    cache_ttl_seconds: config.cache_ttl_seconds,
    response_body_limit_bytes: config.response_body_limit_bytes,
    max_retries: config.max_retries,
    max_price_deviation_percent: config.max_price_deviation_percent,
    contexts,
    fallback_enabled: config.fallback_enabled,
    fallback_mode: config.fallback_mode,
    fallback_value: config.default.value,
    default: {
      mode: config.fallback_mode,
      value: config.default.value,
    },
    overrides: cleanOverrides(config.overrides),
    max_fee: config.max_fee,
    max_total: config.max_total,
  }
  // Omit a false value so the server can use its automatic-discovery mode.
  // An explicit true still opts into the configured estimator path.
  if (config.dynamic_enabled) serialized.dynamic_enabled = true
  if (options.includeLegacyEnabled) serialized.enabled = config.fallback_enabled
  return JSON.stringify(serialized, null, 2)
}

export const DEFAULT_GMPAY_FEE_CONFIG_JSON = serializeGMPayFeeConfig(
  DEFAULT_GMPAY_FEE_CONFIG
)

type ConfigEditorProps = {
  value: string
  onChange: (value: string) => void
  ariaInvalid?: boolean
  /** Optional server-provided discovery snapshot for deployments that expose
   * the authenticated GMPay capability status endpoint. */
  discoveryStatus?: GMPayDiscoveryStatus
  /** Optional callback used by the "test estimate" action. It must perform
   * the server-side request; browser code never receives RPC credentials. */
  onTestEstimate?: () =>
    | GMPayDiscoveryStatus
    | void
    | Promise<GMPayDiscoveryStatus | void>
  testingEstimate?: boolean
}

function deriveDiscoveryStatus(config: GMPayFeeConfig): GMPayDiscoveryStatus {
  const networks = GMPAY_NETWORKS.filter(
    (network) =>
      Boolean(config.rpc_references[network]?.trim()) ||
      Boolean(config.price_source_references[network]?.trim()) ||
      Boolean(config.contexts[network])
  ).map((network) => ({
    network,
    // EPUSDT is the only asset currently supported by this integration. Keep
    // the token list conservative when the gateway snapshot is unavailable.
    tokens: ['USDT'],
  }))

  return {
    state: networks.length > 0 ? 'idle' : 'unavailable',
    networks,
  }
}

function formatDiscoveryTimestamp(value: string | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString()
}

function discoveryStateLabel(
  state: GMPayDiscoveryStatus['state'],
  t: (key: string) => string
) {
  switch (state) {
    case 'ready':
      return t('Ready')
    case 'syncing':
      return t('Syncing')
    case 'error':
      return t('Error')
    case 'unavailable':
      return t('Unavailable')
    default:
      return t('Waiting for gateway sync')
  }
}

type GMPayFeeStatusApiResponse = {
  success: boolean
  data?: {
    configured?: boolean
    capability?: boolean
    healthy?: boolean
    quote_available?: boolean
    reason?: string
    supported_assets?: Array<{
      network?: string
      token?: string
      display_name?: string
    }>
    last_sync_at?: number
    last_success_at?: number
  }
}

type GMPayFeeEstimateApiResponse = {
  success: boolean
  data?: {
    token?: string
    network?: string
    native_asset?: string
    native_amount?: string
    fee_amount?: string
    settlement_currency?: string
    quoted_at?: string
    expires_at?: string
  }
  message?: string
}

function mapGMPayFeeStatusResponse(
  response: GMPayFeeStatusApiResponse
): GMPayDiscoveryStatus {
  const data = response.data
  const grouped = new Map<string, Set<string>>()
  for (const asset of data?.supported_assets ?? []) {
    const rawNetwork = asset.network?.trim().toLowerCase()
    if (!rawNetwork) continue
    const network = NETWORK_ALIASES[rawNetwork] ?? rawNetwork
    const tokens = grouped.get(network) ?? new Set<string>()
    if (asset.token?.trim()) tokens.add(asset.token.trim().toUpperCase())
    grouped.set(network, tokens)
  }
  const networks = Array.from(grouped, ([network, tokens]) => ({
    network,
    tokens: [...tokens],
  }))
  let state: GMPayDiscoveryStatus['state'] = 'unavailable'
  if (data?.healthy && data.quote_available) state = 'ready'
  else if (data?.configured && data.capability) state = 'error'

  return {
    state,
    networks,
    lastSyncedAt: data?.last_sync_at
      ? new Date(data.last_sync_at * 1000).toISOString()
      : undefined,
    lastSuccessAt: data?.last_success_at
      ? new Date(data.last_success_at * 1000).toISOString()
      : undefined,
    error: state === 'ready' ? undefined : data?.reason,
  }
}

export async function getGMPayDiscoveryStatus() {
  const response = await api.get<GMPayFeeStatusApiResponse>(
    '/api/option/gmpay_fee/status'
  )
  if (!response.data?.success) {
    throw new Error(response.data?.data?.reason ?? 'GMPay status unavailable')
  }
  return mapGMPayFeeStatusResponse(response.data)
}

export async function testGMPayFeeEstimate() {
  const response = await api.post<GMPayFeeEstimateApiResponse>(
    '/api/option/gmpay_fee/test'
  )
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message ?? 'GMPay estimate unavailable')
  }
  const estimate = response.data.data
  return {
    state: 'ready' as const,
    lastEstimate: {
      network:
        NETWORK_ALIASES[estimate.network?.trim().toLowerCase() ?? ''] ??
        estimate.network ?? '',
      token: estimate.token ?? '',
      feeAmount: estimate.fee_amount,
      nativeAmount: estimate.native_amount,
      nativeAsset: estimate.native_asset,
      settlementCurrency: estimate.settlement_currency,
      quotedAt: estimate.quoted_at,
      expiresAt: estimate.expires_at,
    },
  }
}

type ConfigInputProps = {
  id: string
  label: string
  value: string | number
  onChange: (value: string) => void
  description?: string
  type?: React.HTMLInputTypeAttribute
  min?: number
  max?: number
  step?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  sensitive?: boolean
  required?: boolean
}

function ConfigInput(props: ConfigInputProps) {
  const { t } = useTranslation()
  const [revealed, setRevealed] = React.useState(false)
  const sensitive = props.sensitive === true
  let inputType = props.type ?? 'text'
  if (sensitive) inputType = revealed ? 'text' : 'password'
  return (
    <div className='min-w-0 space-y-1.5'>
      <Label htmlFor={props.id}>
        {props.label}
        {props.required ? (
          <span className='text-destructive ms-1' aria-hidden='true'>
            *
          </span>
        ) : null}
      </Label>
      <div className={cn(sensitive && 'relative')}>
        <Input
          id={props.id}
          type={inputType}
          value={props.value}
          min={props.min}
          max={props.max}
          step={props.step}
          inputMode={props.inputMode}
          autoComplete={sensitive ? 'new-password' : 'off'}
          required={props.required}
          aria-required={props.required || undefined}
          data-sensitive={sensitive ? 'true' : undefined}
          className={cn(sensitive && 'pe-9')}
          onChange={(event) => props.onChange(event.target.value)}
        />
        {sensitive ? (
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='text-muted-foreground absolute end-1 top-1/2 size-7 -translate-y-1/2'
            aria-label={
              revealed ? t('Hide sensitive data') : t('Show sensitive data')
            }
            title={
              revealed ? t('Hide sensitive data') : t('Show sensitive data')
            }
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? (
              <EyeOff className='size-4' aria-hidden='true' />
            ) : (
              <Eye className='size-4' aria-hidden='true' />
            )}
          </Button>
        ) : null}
      </div>
      {props.description ? (
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {props.description}
        </p>
      ) : null}
    </div>
  )
}

const NETWORK_LABEL_KEYS: Record<GMPayNetwork, string> = {
  tron: 'TRON',
  ethereum: 'Ethereum',
  binance: 'BSC',
  solana: 'Solana',
}

function parseHostListInput(value: string) {
  return value
    .split(/[\n,]/)
    .map((host) => host.trim())
    .filter(Boolean)
}

function formatHostListInput(value: string[] | undefined) {
  return value?.join(', ') ?? ''
}

function ContextFields(props: {
  network: GMPayNetwork
  value: GMPayTransactionContext
  onChange: (value: GMPayTransactionContext) => void
}) {
  const { t } = useTranslation()
  const update = (
    key: keyof GMPayTransactionContext,
    value: string | number | boolean | undefined
  ) => {
    const next = { ...props.value }
    if (value === undefined || (typeof value === 'string' && !value.trim())) {
      delete next[key]
    } else {
      next[key] = value as never
    }
    props.onChange(next)
  }
  const isTron = props.network === 'tron'
  const isSolana = props.network === 'solana'
  const hasContractPayload =
    isTron &&
    (hasContextString(props.value, 'token_contract') ||
      hasContextString(props.value, 'contract') ||
      hasContextString(props.value, 'data') ||
      hasContextString(props.value, 'calldata'))
  const hasSolanaStructured =
    isSolana && hasSolanaStructuredContext(props.value)
  const contextError = getGMPayTransactionContextError(
    props.network,
    props.value
  )
  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-payer`}
          label={t('Payer account')}
          value={props.value.payer ?? ''}
          onChange={(value) => update('payer', value)}
          sensitive
          required={hasSolanaStructured}
          description={t(
            'Server-side payer used to build and sign the representative Solana transfer.'
          )}
        />
      ) : (
        <ConfigInput
          id={`gmpay-${props.network}-from`}
          label={t('Sender account')}
          value={props.value.from ?? ''}
          onChange={(value) => update('from', value)}
          sensitive
          required={hasContractPayload}
          description={t(
            'Required for a trustworthy resource or gas estimate.'
          )}
        />
      )}
      {!isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-to`}
          label={t('Recipient account')}
          value={props.value.to ?? ''}
          onChange={(value) => update('to', value)}
          sensitive
          required={hasContractPayload}
          description={t(
            'Representative collection destination, not a user-supplied address.'
          )}
        />
      ) : null}
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-source-token-account`}
          label={t('Source token account')}
          value={props.value.source_token_account ?? ''}
          onChange={(value) => update('source_token_account', value)}
          sensitive
          required={hasSolanaStructured}
          description={t(
            'Token account debited by the representative transfer; do not use a private key.'
          )}
        />
      ) : null}
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-recipient-token-account`}
          label={t('Recipient token account')}
          value={props.value.recipient_token_account ?? ''}
          onChange={(value) => update('recipient_token_account', value)}
          sensitive
          required={hasSolanaStructured}
          description={t(
            'Token account credited by the representative transfer; it must belong to the configured mint.'
          )}
        />
      ) : null}
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-mint`}
          label={t('Token mint')}
          value={props.value.token_mint ?? props.value.mint ?? ''}
          onChange={(value) => update('token_mint', value)}
          sensitive
          required={hasSolanaStructured}
        />
      ) : (
        <ConfigInput
          id={`gmpay-${props.network}-contract`}
          label={t('Token contract')}
          value={props.value.token_contract ?? ''}
          onChange={(value) => update('token_contract', value)}
          sensitive
          required={hasContractPayload}
        />
      )}
      {isSolana ? (
        <div className='min-w-0 space-y-1.5'>
          <Label htmlFor={`gmpay-${props.network}-transfer-instruction`}>
            {t('Transfer instruction')}
            {hasSolanaStructured ? (
              <span className='text-destructive ms-1' aria-hidden='true'>
                *
              </span>
            ) : null}
          </Label>
          <Select
            value={props.value.transfer_instruction ?? 'transfer'}
            onValueChange={(value) => {
              if (value === 'transfer' || value === 'transferChecked') {
                update('transfer_instruction', value)
              }
            }}
          >
            <SelectTrigger
              id={`gmpay-${props.network}-transfer-instruction`}
              className='w-full'
              aria-required={hasSolanaStructured || undefined}
            >
              <SelectValue placeholder={t('Select transfer instruction')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='transfer'>transfer</SelectItem>
              <SelectItem value='transferChecked'>transferChecked</SelectItem>
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Choose the controlled SPL Token instruction used by the representative transfer.'
            )}
          </p>
        </div>
      ) : null}
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-transfer-amount`}
          label={t('Transfer amount (base units)')}
          value={props.value.transfer_amount_base_units ?? ''}
          onChange={(value) => update('transfer_amount_base_units', value)}
          required={hasSolanaStructured}
          inputMode='numeric'
          description={t(
            'Use the exact integer amount encoded by the transfer instruction; decimals are configured separately.'
          )}
        />
      ) : null}
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-token-decimals`}
          label={t('Token decimals')}
          value={props.value.token_decimals ?? ''}
          type='number'
          min={0}
          max={MAX_SOLANA_TOKEN_DECIMALS}
          step='1'
          onChange={(value) => {
            if (!value.trim()) {
              update('token_decimals', undefined)
              return
            }
            const parsed = Number(value)
            update(
              'token_decimals',
              Number.isInteger(parsed) ? parsed : undefined
            )
          }}
          required={hasSolanaStructured}
          inputMode='numeric'
          description={t(
            'USDT commonly uses 6 decimals on Solana; keep this aligned with the mint.'
          )}
        />
      ) : null}
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-recent-blockhash`}
          label={t('Recent blockhash')}
          value={props.value.recent_blockhash ?? ''}
          onChange={(value) => update('recent_blockhash', value)}
          sensitive
          required={hasSolanaStructured}
          description={t(
            'Use a recent blockhash from the same cluster as the configured RPC.'
          )}
        />
      ) : null}
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-token-program-id`}
          label={t('Token program ID')}
          value={props.value.token_program_id ?? ''}
          onChange={(value) => update('token_program_id', value)}
          sensitive
          required={hasSolanaStructured}
          description={t(
            'Use the canonical SPL Token program ID or Token-2022 program ID; never paste a private key.'
          )}
        />
      ) : null}
      <ConfigInput
        id={`gmpay-${props.network}-${isSolana ? 'message' : 'calldata'}`}
        label={t(
          isSolana ? 'Legacy Solana message (base64)' : 'Transfer calldata'
        )}
        value={props.value[isSolana ? 'message' : 'calldata'] ?? ''}
        onChange={(value) => update(isSolana ? 'message' : 'calldata', value)}
        sensitive
        required={isTron ? hasContractPayload : false}
        description={t(
          isSolana
            ? 'Optional legacy message for compatibility. Dynamic Solana estimation requires the structured fields above and verifies any supplied message against them.'
            : 'Use representative calldata only. Do not paste secrets or private keys.'
        )}
      />
      {isTron ? (
        <ConfigInput
          id={`gmpay-${props.network}-function-selector`}
          label={t('TRON function selector')}
          value={props.value.function_selector ?? ''}
          onChange={(value) => update('function_selector', value)}
          required={hasContractPayload}
          description={t(
            'Required for TRC-20 transfers. Use a signature such as transfer(address,uint256), not a guessed selector hash.'
          )}
        />
      ) : null}
      {isTron ? (
        <ConfigInput
          id={`gmpay-${props.network}-bandwidth-bytes`}
          label={t('Bandwidth bytes')}
          value={props.value.bandwidth_bytes ?? ''}
          type='number'
          min={1}
          max={Number.MAX_SAFE_INTEGER}
          step='1'
          onChange={(value) => {
            if (!value.trim()) {
              update('bandwidth_bytes', undefined)
              return
            }
            const parsed = Number(value)
            update(
              'bandwidth_bytes',
              Number.isSafeInteger(parsed) ? parsed : undefined
            )
          }}
          description={t(
            'Required for a TRON resource estimate; use the representative transaction size.'
          )}
          inputMode='numeric'
        />
      ) : null}
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-priority-fee`}
          label={t('Priority fee (lamports)')}
          value={props.value.priority_fee_lamports ?? ''}
          onChange={(value) => update('priority_fee_lamports', value)}
          inputMode='numeric'
        />
      ) : null}
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-priority-fee-per-unit`}
          label={t('Priority fee per compute unit (micro-lamports)')}
          value={props.value.priority_fee_per_unit ?? ''}
          onChange={(value) => update('priority_fee_per_unit', value)}
          inputMode='decimal'
        />
      ) : null}
      {isSolana ? (
        <ConfigInput
          id={`gmpay-${props.network}-compute-units`}
          label={t('Compute units')}
          value={props.value.compute_units ?? ''}
          type='number'
          min={1}
          max={Number.MAX_SAFE_INTEGER}
          step='1'
          onChange={(value) => {
            if (!value.trim()) {
              update('compute_units', undefined)
              return
            }
            const parsed = Number(value)
            update(
              'compute_units',
              Number.isSafeInteger(parsed) ? parsed : undefined
            )
          }}
          inputMode='numeric'
        />
      ) : null}
      <div className='flex items-center justify-between gap-4 rounded-lg border px-3 py-2 sm:col-span-2'>
        <div className='min-w-0'>
          <Label htmlFor={`gmpay-${props.network}-batch`}>
            {t('Batch collection')}
          </Label>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Include batch behavior when the representative collection transaction is batched.'
            )}
          </p>
        </div>
        <Switch
          id={`gmpay-${props.network}-batch`}
          checked={props.value.batch === true}
          onCheckedChange={(checked) => update('batch', checked)}
        />
      </div>
      {contextError ? (
        <p
          className='text-destructive flex items-start gap-2 text-xs leading-relaxed sm:col-span-2'
          role='alert'
        >
          <CircleAlert
            className='mt-0.5 size-3.5 shrink-0'
            aria-hidden='true'
          />
          <span>{t(contextError)}</span>
        </p>
      ) : null}
    </div>
  )
}

export function GMPayFeeConfigEditor(props: ConfigEditorProps) {
  const { t } = useTranslation()
  const parsedValue = React.useMemo(
    () => parseGMPayFeeConfig(props.value),
    [props.value]
  )
  const preserveLegacyEnabled = React.useMemo(() => {
    if (!props.value.trim()) return false
    try {
      const raw = JSON.parse(props.value) as unknown
      return (
        isRecord(raw) &&
        Object.hasOwn(raw, 'enabled') &&
        !Object.hasOwn(raw, 'fallback_enabled')
      )
    } catch {
      return false
    }
  }, [props.value])
  const [draft, setDraft] = React.useState<GMPayFeeConfig>(
    () => parsedValue ?? DEFAULT_GMPAY_FEE_CONFIG
  )
  const lastEmittedValue = React.useRef(props.value)
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<GMPayDiscoveryStatus>()
  const [localTesting, setLocalTesting] = React.useState(false)

  React.useEffect(() => {
    if (props.value === lastEmittedValue.current || !parsedValue) return
    setDraft(parsedValue)
    lastEmittedValue.current = props.value
  }, [parsedValue, props.value])

  React.useEffect(() => {
    setRuntimeStatus(undefined)
  }, [props.value])

  const effectiveDiscoveryStatus =
    runtimeStatus ?? props.discoveryStatus ?? deriveDiscoveryStatus(draft)
  const isTestingEstimate = props.testingEstimate ?? localTesting
  const runTestEstimate = async () => {
    if (!props.onTestEstimate || isTestingEstimate) return
    setLocalTesting(true)
    try {
      const result = await props.onTestEstimate()
      if (result) setRuntimeStatus(result)
    } catch {
      setRuntimeStatus({
        state: 'error',
        error: 'Unable to run estimate. Please retry.',
      })
    } finally {
      setLocalTesting(false)
    }
  }

  const updateDraft = (next: GMPayFeeConfig) => {
    setDraft(next)
    const serialized = serializeGMPayFeeConfig(next, {
      includeLegacyEnabled: preserveLegacyEnabled,
    })
    lastEmittedValue.current = serialized
    props.onChange(serialized)
  }

  const updateContext = (
    network: GMPayNetwork,
    context: GMPayTransactionContext
  ) => {
    updateDraft({
      ...draft,
      contexts: { ...draft.contexts, [network]: context },
    })
  }

  const addOverride = () => {
    for (const token of ['USDT', 'USDC'] as const) {
      for (const network of GMPAY_NETWORKS) {
        const key = `${token}:${network}`
        if (!draft.overrides[key]) {
          updateDraft({
            ...draft,
            overrides: {
              ...draft.overrides,
              [key]: { mode: draft.fallback_mode, value: '0.00' },
            },
          })
          return
        }
      }
    }
  }

  const updateOverride = (
    currentKey: string,
    next: GMPayFeeRule | { token: string; network: GMPayNetwork }
  ) => {
    const overrides = { ...draft.overrides }
    if ('token' in next) {
      const nextKey = `${next.token}:${next.network}`
      if (nextKey === currentKey || overrides[nextKey]) return
      overrides[nextKey] = overrides[currentKey]
      delete overrides[currentKey]
    } else {
      overrides[currentKey] = next
    }
    updateDraft({ ...draft, overrides })
  }

  const deleteOverride = (key: string) => {
    const overrides = { ...draft.overrides }
    delete overrides[key]
    updateDraft({ ...draft, overrides })
  }

  const networkCount = Object.keys(draft.overrides).length
  // Endpoint URLs and representative transaction context are server-owned
  // discovery data. Keep the fields in the draft/serializer for backwards
  // compatibility, but never render the low-level editor in the admin UI.
  const showAdvancedEstimatorEditor = false
  let discoveryStatusIcon = (
    <CircleAlert className='size-3.5' aria-hidden='true' />
  )
  if (effectiveDiscoveryStatus.state === 'ready') {
    discoveryStatusIcon = (
      <CheckCircle2 className='size-3.5' aria-hidden='true' />
    )
  } else if (effectiveDiscoveryStatus.state === 'syncing') {
    discoveryStatusIcon = (
      <Loader2 className='size-3.5 animate-spin' aria-hidden='true' />
    )
  }

  return (
    <div
      className={cn(
        'space-y-6 rounded-lg border bg-muted/10 p-4 sm:p-5',
        props.ariaInvalid && 'border-destructive/60'
      )}
      aria-invalid={props.ariaInvalid}
    >
      <div className='flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm'>
        <CircleAlert
          className='mt-0.5 size-4 shrink-0 text-amber-600'
          aria-hidden='true'
        />
        <p className='leading-relaxed'>
          {t(
            'Dynamic network fee estimation is not a GMPay gateway service fee. Gateway fees are only represented by an explicitly enabled administrator fallback.'
          )}
        </p>
      </div>

      <section
        className='space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4'
        aria-labelledby='gmpay-discovery-heading'
      >
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='min-w-0'>
            <h3 id='gmpay-discovery-heading' className='font-medium'>
              {t('Automatic GMPay network fee discovery')}
            </h3>
            <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
              {t(
                'The server discovers EPUSDT networks, settlement context, and trusted price data from the configured GMPay gateway. No RPC URLs, wallet addresses, contracts, or calldata are required here.'
              )}
            </p>
            <p className='text-muted-foreground mt-2 text-xs leading-relaxed'>
              {t(
                'Automatic estimates are attempted for Native wallet checkout and fail closed when the gateway cannot provide reliable context. Use the optional administrator fallback below only when explicitly needed.'
              )}
            </p>
          </div>
          <div
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-xs font-medium',
              effectiveDiscoveryStatus.state === 'ready' &&
                'border-emerald-500/40 bg-emerald-500/10 text-emerald-700',
              effectiveDiscoveryStatus.state === 'syncing' &&
                'border-blue-500/40 bg-blue-500/10 text-blue-700',
              effectiveDiscoveryStatus.state === 'error' &&
                'border-destructive/40 bg-destructive/10 text-destructive',
              effectiveDiscoveryStatus.state === 'unavailable' &&
                'border-amber-500/40 bg-amber-500/10 text-amber-700',
              effectiveDiscoveryStatus.state === 'idle' &&
                'border-muted-foreground/30 bg-muted text-muted-foreground'
            )}
            role='status'
            aria-live='polite'
          >
            {discoveryStatusIcon}
            {discoveryStateLabel(effectiveDiscoveryStatus.state, t)}
          </div>
        </div>

        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='rounded-md border bg-background/60 p-3'>
            <p className='text-muted-foreground text-xs font-medium uppercase tracking-wide'>
              {t('Supported networks and tokens')}
            </p>
            {effectiveDiscoveryStatus.networks?.length ? (
              <div className='mt-2 flex flex-wrap gap-2'>
                {effectiveDiscoveryStatus.networks.map((entry) => (
                  <span
                    key={entry.network}
                    className='rounded-md border bg-muted/60 px-2 py-1 text-xs'
                  >
                    {NETWORK_LABEL_KEYS[entry.network as GMPayNetwork]
                      ? t(NETWORK_LABEL_KEYS[entry.network as GMPayNetwork])
                      : entry.network}{' '}
                    <span className='text-muted-foreground'>
                      ({
                        entry.tokens.length
                          ? entry.tokens.join(', ')
                          : t('No tokens')
                      })
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className='text-muted-foreground mt-2 text-xs'>
                {t('No networks reported by the gateway.')}
              </p>
            )}
          </div>
          <div className='rounded-md border bg-background/60 p-3'>
            <p className='text-muted-foreground text-xs font-medium uppercase tracking-wide'>
              {t('Last synced')}
            </p>
            <p className='mt-2 text-sm'>
              {formatDiscoveryTimestamp(effectiveDiscoveryStatus.lastSyncedAt) ??
                t('No successful sync yet')}
            </p>
            <p className='text-muted-foreground mt-3 text-xs font-medium uppercase tracking-wide'>
              {t('Last successful estimate')}
            </p>
            <p className='mt-1 text-sm'>
              {formatDiscoveryTimestamp(effectiveDiscoveryStatus.lastSuccessAt) ??
                t('No successful estimate yet')}
            </p>
          </div>
        </div>

        {effectiveDiscoveryStatus.lastEstimate ? (
          <div className='rounded-md border bg-background/60 p-3'>
            <p className='text-muted-foreground text-xs font-medium uppercase tracking-wide'>
              {t('Latest test estimate')}
            </p>
            <div className='mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2'>
              <p>
                <span className='text-muted-foreground'>{t('Network')}: </span>
                {NETWORK_LABEL_KEYS[
                  effectiveDiscoveryStatus.lastEstimate.network as GMPayNetwork
                ]
                  ? t(
                      NETWORK_LABEL_KEYS[
                        effectiveDiscoveryStatus.lastEstimate.network as GMPayNetwork
                      ]
                    )
                  : effectiveDiscoveryStatus.lastEstimate.network}
              </p>
              <p>
                <span className='text-muted-foreground'>{t('Token')}: </span>
                {effectiveDiscoveryStatus.lastEstimate.token}
              </p>
              {effectiveDiscoveryStatus.lastEstimate.feeAmount ? (
                <p>
                  <span className='text-muted-foreground'>{t('Fee')}: </span>
                  {effectiveDiscoveryStatus.lastEstimate.feeAmount}
                </p>
              ) : null}
              {effectiveDiscoveryStatus.lastEstimate.nativeAmount ? (
                <p>
                  <span className='text-muted-foreground'>
                    {t('Native amount')}:{' '}
                  </span>
                  {effectiveDiscoveryStatus.lastEstimate.nativeAmount}{' '}
                  {effectiveDiscoveryStatus.lastEstimate.nativeAsset ?? ''}
                </p>
              ) : null}
              {effectiveDiscoveryStatus.lastEstimate.settlementCurrency ? (
                <p>
                  <span className='text-muted-foreground'>
                    {t('Settlement currency')}:{' '}
                  </span>
                  {effectiveDiscoveryStatus.lastEstimate.settlementCurrency}
                </p>
              ) : null}
              {formatDiscoveryTimestamp(
                effectiveDiscoveryStatus.lastEstimate.quotedAt
              ) ? (
                <p>
                  <span className='text-muted-foreground'>{t('Quoted at')}: </span>
                  {formatDiscoveryTimestamp(
                    effectiveDiscoveryStatus.lastEstimate.quotedAt
                  )}
                </p>
              ) : null}
              {formatDiscoveryTimestamp(
                effectiveDiscoveryStatus.lastEstimate.expiresAt
              ) ? (
                <p>
                  <span className='text-muted-foreground'>
                    {t('Quote expires at')}:{' '}
                  </span>
                  {formatDiscoveryTimestamp(
                    effectiveDiscoveryStatus.lastEstimate.expiresAt
                  )}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {effectiveDiscoveryStatus.error ? (
          <p
            className='text-destructive flex items-start gap-2 text-xs leading-relaxed'
            role='alert'
          >
            <CircleAlert
              className='mt-0.5 size-3.5 shrink-0'
              aria-hidden='true'
            />
            <span>{effectiveDiscoveryStatus.error}</span>
          </p>
        ) : null}

        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Automatic discovery is managed by the server; this browser never receives RPC credentials.'
            )}
          </p>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='shrink-0'
            onClick={() => void runTestEstimate()}
            disabled={!props.onTestEstimate || isTestingEstimate}
          >
            {isTestingEstimate ? (
              <Loader2 className='size-3.5 animate-spin' aria-hidden='true' />
            ) : (
              <RefreshCw className='size-3.5' aria-hidden='true' />
            )}
            {t('Test estimate')}
          </Button>
        </div>
      </section>

      {showAdvancedEstimatorEditor ? (
        <>
      <div className='flex items-center justify-between gap-4 rounded-lg border px-3 py-3'>
        <div className='min-w-0'>
          <Label htmlFor='gmpay-dynamic-enabled'>
            {t('Enable dynamic network fee estimation')}
          </Label>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Use official chain RPC and trusted price references before falling back to administrator rules.'
            )}
          </p>
        </div>
        <Switch
          id='gmpay-dynamic-enabled'
          checked={draft.dynamic_enabled}
          onCheckedChange={(checked) =>
            updateDraft({ ...draft, dynamic_enabled: checked })
          }
        />
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <div className='min-w-0 space-y-1.5'>
          <Label htmlFor='gmpay-estimator-mode'>{t('Estimator mode')}</Label>
          <Select
            value={draft.estimator_mode}
            onValueChange={(value) => {
              if (
                value === 'auto' ||
                value === 'tron' ||
                value === 'evm' ||
                value === 'solana'
              ) {
                updateDraft({ ...draft, estimator_mode: value })
              }
            }}
          >
            <SelectTrigger id='gmpay-estimator-mode' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='auto'>{t('Automatic by network')}</SelectItem>
              <SelectItem value='tron'>{t('TRON resources')}</SelectItem>
              <SelectItem value='evm'>{t('EVM gas')}</SelectItem>
              <SelectItem value='solana'>{t('Solana message fee')}</SelectItem>
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Choose automatic selection unless all configured assets use one chain family.'
            )}
          </p>
        </div>
        <ConfigInput
          id='gmpay-price-deviation'
          label={t('Maximum price deviation (%)')}
          value={draft.max_price_deviation_percent}
          onChange={(value) =>
            updateDraft({ ...draft, max_price_deviation_percent: value })
          }
          description={t(
            'Reject quotes when trusted price sources differ beyond this percentage.'
          )}
          inputMode='decimal'
        />
      </div>

      <fieldset className='space-y-4'>
        <legend className='text-sm font-medium'>
          {t('Trusted RPC and price references')}
        </legend>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {t(
            'Enter administrator-controlled HTTP or HTTPS endpoint URLs. Checkout requests cannot replace these endpoints or provide credentials.'
          )}
        </p>
        <div className='grid gap-4 md:grid-cols-2'>
          {GMPAY_NETWORKS.map((network) => (
            <div key={network} className='space-y-3 rounded-lg border p-3'>
              <h4 className='text-sm font-medium'>
                {t(NETWORK_LABEL_KEYS[network])}
              </h4>
              <ConfigInput
                id={`gmpay-${network}-rpc-reference`}
                label={t('RPC endpoint URL')}
                value={draft.rpc_references[network]}
                onChange={(value) =>
                  updateDraft({
                    ...draft,
                    rpc_references: {
                      ...draft.rpc_references,
                      [network]: value,
                    },
                  })
                }
                sensitive
                description={t(
                  'Use an administrator-controlled endpoint URL. It stays editable and can be revealed when it contains a provider key.'
                )}
              />
              <ConfigInput
                id={`gmpay-${network}-price-reference`}
                label={t('Price source URL')}
                value={draft.price_source_references[network]}
                onChange={(value) => {
                  const sources = getPriceSources(draft, network)
                  updateDraft({
                    ...draft,
                    price_source_references: {
                      ...draft.price_source_references,
                      [network]: value,
                    },
                    price_source_lists: {
                      ...draft.price_source_lists,
                      [network]: normalizePriceSourceList([
                        value,
                        ...sources.slice(1),
                      ]),
                    },
                  })
                }}
                sensitive
                description={t(
                  'Use an administrator-controlled endpoint URL. It stays editable and can be revealed when it contains a provider key.'
                )}
              />
              <ConfigInput
                id={`gmpay-${network}-additional-price-sources`}
                label={t('Additional price source URLs')}
                value={formatPriceSourceListInput(
                  getPriceSources(draft, network).slice(1)
                )}
                onChange={(value) => {
                  const primary =
                    draft.price_source_references[network]?.trim() ?? ''
                  updateDraft({
                    ...draft,
                    price_source_lists: {
                      ...draft.price_source_lists,
                      [network]: normalizePriceSourceList([
                        primary,
                        ...parsePriceSourceListInput(value),
                      ]),
                    },
                  })
                }}
                sensitive
                description={t(
                  'Optional comma-separated URLs for independent price consensus. Configure at most 8 total sources, including the primary URL.'
                )}
              />
              <ConfigInput
                id={`gmpay-${network}-rpc-allowed-hosts`}
                label={t('RPC allowed hosts')}
                value={formatHostListInput(draft.rpc_allowed_hosts[network])}
                sensitive
                onChange={(value) =>
                  updateDraft({
                    ...draft,
                    rpc_allowed_hosts: {
                      ...draft.rpc_allowed_hosts,
                      [network]: parseHostListInput(value),
                    },
                  })
                }
                description={t(
                  'Optional comma-separated hostnames used to pin the RPC endpoint; reveal only when editing.'
                )}
              />
              <ConfigInput
                id={`gmpay-${network}-price-allowed-hosts`}
                label={t('Price allowed hosts')}
                value={formatHostListInput(draft.price_allowed_hosts[network])}
                sensitive
                onChange={(value) =>
                  updateDraft({
                    ...draft,
                    price_allowed_hosts: {
                      ...draft.price_allowed_hosts,
                      [network]: parseHostListInput(value),
                    },
                  })
                }
                description={t(
                  'Optional comma-separated hostnames used to pin the price endpoint; reveal only when editing.'
                )}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className='space-y-4'>
        <legend className='text-sm font-medium'>
          {t('Timeouts, caching, and limits')}
        </legend>
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <ConfigInput
            id='gmpay-request-timeout'
            label={t('Request timeout (ms)')}
            value={draft.request_timeout_ms}
            type='number'
            min={100}
            max={30000}
            step='1'
            onChange={(value) =>
              updateDraft({ ...draft, request_timeout_ms: Number(value) || 0 })
            }
          />
          <ConfigInput
            id='gmpay-cache-ttl'
            label={t('Cache TTL (seconds)')}
            value={draft.cache_ttl_seconds}
            type='number'
            min={1}
            max={86400}
            step='1'
            onChange={(value) =>
              updateDraft({ ...draft, cache_ttl_seconds: Number(value) || 0 })
            }
          />
          <ConfigInput
            id='gmpay-quote-ttl'
            label={t('Quote validity (seconds)')}
            value={draft.quote_ttl_seconds}
            type='number'
            min={1}
            max={86400}
            step='1'
            onChange={(value) =>
              updateDraft({ ...draft, quote_ttl_seconds: Number(value) || 0 })
            }
          />
          <ConfigInput
            id='gmpay-price-max-age'
            label={t('Price data max age (seconds)')}
            value={draft.price_max_age_seconds}
            type='number'
            min={1}
            max={86400}
            step='1'
            onChange={(value) =>
              updateDraft({
                ...draft,
                price_max_age_seconds: Number(value) || 0,
              })
            }
            description={t(
              'Reject price data older than this bound when calculating a network estimate.'
            )}
          />
          <ConfigInput
            id='gmpay-response-limit'
            label={t('Response body limit (bytes)')}
            value={draft.response_body_limit_bytes}
            type='number'
            min={1024}
            max={8388608}
            step='1'
            onChange={(value) =>
              updateDraft({
                ...draft,
                response_body_limit_bytes: Number(value) || 0,
              })
            }
          />
          <ConfigInput
            id='gmpay-max-retries'
            label={t('Maximum retries')}
            value={draft.max_retries}
            type='number'
            min={0}
            max={2}
            step='1'
            onChange={(value) =>
              updateDraft({ ...draft, max_retries: Number(value) || 0 })
            }
          />
          <ConfigInput
            id='gmpay-max-fee'
            label={t('Maximum fee (USD)')}
            value={draft.max_fee}
            onChange={(value) => updateDraft({ ...draft, max_fee: value })}
            inputMode='decimal'
          />
          <ConfigInput
            id='gmpay-max-total'
            label={t('Maximum total (USD)')}
            value={draft.max_total}
            onChange={(value) => updateDraft({ ...draft, max_total: value })}
            inputMode='decimal'
          />
        </div>
      </fieldset>

      <fieldset className='space-y-4'>
        <legend className='text-sm font-medium'>
          {t('Representative collection transaction context')}
        </legend>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {t(
            'Provide the server-controlled sender, recipient, contract or mint, and transaction data needed for a real estimate. Missing context fails closed or uses the enabled fallback.'
          )}
        </p>
        <div className='space-y-4'>
          {GMPAY_NETWORKS.map((network) => (
            <div key={network} className='space-y-3 rounded-lg border p-3'>
              <h4 className='text-sm font-medium'>
                {t(NETWORK_LABEL_KEYS[network])}
              </h4>
              <ContextFields
                network={network}
                value={draft.contexts[network] ?? {}}
                onChange={(context) => updateContext(network, context)}
              />
            </div>
          ))}
        </div>
      </fieldset>

        </>
      ) : null}

      <fieldset className='space-y-4'>
        <legend className='text-sm font-medium'>
          {t('Administrator fallback')}
        </legend>
        <div className='flex items-center justify-between gap-4 rounded-lg border px-3 py-3'>
          <div className='min-w-0'>
            <Label htmlFor='gmpay-fallback-enabled'>
              {t('Enable fallback when estimation fails')}
            </Label>
            <p className='text-muted-foreground text-xs leading-relaxed'>
              {t(
                'Keep this off to reject a checkout when a dynamic quote is unavailable or expired.'
              )}
            </p>
          </div>
          <Switch
            id='gmpay-fallback-enabled'
            checked={draft.fallback_enabled}
            onCheckedChange={(checked) =>
              updateDraft({
                ...draft,
                fallback_enabled: checked,
                enabled: checked,
              })
            }
          />
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='min-w-0 space-y-1.5'>
            <Label htmlFor='gmpay-fallback-mode'>
              {t('Fallback rule type')}
            </Label>
            <Select
              value={draft.fallback_mode}
              onValueChange={(value) => {
                if (value !== 'fixed' && value !== 'percent') return
                updateDraft({
                  ...draft,
                  fallback_mode: value,
                  default: { ...draft.default, mode: value },
                })
              }}
            >
              <SelectTrigger id='gmpay-fallback-mode' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='fixed'>{t('Fixed amount')}</SelectItem>
                <SelectItem value='percent'>
                  {t('Percentage of top-up')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ConfigInput
            id='gmpay-default-fee'
            label={t('Default fallback value')}
            value={draft.default.value}
            onChange={(value) =>
              updateDraft({
                ...draft,
                default: { ...draft.default, value },
              })
            }
            description={t(
              'Fixed values and percentages are expressed in USD and capped by maximum fee and total.'
            )}
            inputMode='decimal'
          />
        </div>
      </fieldset>

      <fieldset className='space-y-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <legend className='text-sm font-medium'>
              {t('Asset and network overrides')}
            </legend>
            <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
              {t(
                'Override the default fallback for USDT or USDC on a specific network.'
              )}
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={addOverride}
            disabled={networkCount >= GMPAY_NETWORKS.length * 2}
            className='w-full sm:w-auto'
          >
            <Plus className='mr-2 size-3.5' aria-hidden='true' />
            {t('Add override')}
          </Button>
        </div>
        {networkCount === 0 ? (
          <div className='text-muted-foreground rounded-lg border border-dashed p-5 text-center text-sm'>
            {t(
              'No asset overrides configured. The default fallback rule will be used.'
            )}
          </div>
        ) : (
          <div className='space-y-3'>
            {Object.entries(draft.overrides).map(([key, rule]) => {
              const [tokenValue, networkValue] = key.split(':')
              const network = normalizeNetwork(networkValue) ?? 'tron'
              return (
                <div
                  key={key}
                  className='grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end'
                >
                  <div className='min-w-0 space-y-1.5'>
                    <Label htmlFor={`gmpay-override-token-${key}`}>
                      {t('Token')}
                    </Label>
                    <Select
                      value={tokenValue.toUpperCase()}
                      onValueChange={(value) => {
                        if (value === 'USDT' || value === 'USDC') {
                          updateOverride(key, { token: value, network })
                        }
                      }}
                    >
                      <SelectTrigger
                        id={`gmpay-override-token-${key}`}
                        className='w-full'
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='USDT'>USDT</SelectItem>
                        <SelectItem value='USDC'>USDC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='min-w-0 space-y-1.5'>
                    <Label htmlFor={`gmpay-override-network-${key}`}>
                      {t('Network')}
                    </Label>
                    <Select
                      value={network}
                      onValueChange={(value) => {
                        if (!value) return
                        const normalized = normalizeNetwork(value)
                        if (normalized) {
                          updateOverride(key, {
                            token: tokenValue.toUpperCase(),
                            network: normalized,
                          })
                        }
                      }}
                    >
                      <SelectTrigger
                        id={`gmpay-override-network-${key}`}
                        className='w-full'
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GMPAY_NETWORKS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(NETWORK_LABEL_KEYS[option])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='min-w-0 space-y-1.5'>
                    <Label htmlFor={`gmpay-override-mode-${key}`}>
                      {t('Rule type')}
                    </Label>
                    <Select
                      value={rule.mode}
                      onValueChange={(value) => {
                        if (value === 'fixed' || value === 'percent') {
                          updateOverride(key, { ...rule, mode: value })
                        }
                      }}
                    >
                      <SelectTrigger
                        id={`gmpay-override-mode-${key}`}
                        className='w-full'
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='fixed'>
                          {t('Fixed amount')}
                        </SelectItem>
                        <SelectItem value='percent'>
                          {t('Percentage')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <ConfigInput
                    id={`gmpay-override-value-${key}`}
                    label={t('Value')}
                    value={rule.value}
                    onChange={(value) =>
                      updateOverride(key, { ...rule, value })
                    }
                    inputMode='decimal'
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    onClick={() => deleteOverride(key)}
                    aria-label={t('Remove {{asset}} override', { asset: key })}
                    className='text-destructive hover:text-destructive justify-self-end'
                  >
                    <Trash2 className='size-4' aria-hidden='true' />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </fieldset>
    </div>
  )
}
