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
import { useState, useEffect, useCallback } from 'react'

import { getTopupInfo } from '../api'
import {
  generatePresetAmounts,
  mergePresetAmounts,
  getMinTopupAmount,
} from '../lib'
import type {
  TopupInfo,
  PresetAmount,
  CreemProduct,
  PaymentMethod,
  WaffoPayMethod,
  CryptoAsset,
} from '../types'

// ============================================================================
// Topup Info Hook
// ============================================================================

function parseJsonArray(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data
  }

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

function parsePaymentMethods(
  data: unknown,
  stripeMinTopup: number
): PaymentMethod[] {
  return parseJsonArray(data)
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object'
    )
    .map((item) => {
      const rawMinTopup = Number(item.min_topup)
      const normalizedMinTopup = Number.isFinite(rawMinTopup) ? rawMinTopup : 0
      const type = typeof item.type === 'string' ? item.type : ''

      return {
        name: typeof item.name === 'string' ? item.name : '',
        type,
        color: typeof item.color === 'string' ? item.color : undefined,
        icon: typeof item.icon === 'string' ? item.icon : undefined,
        min_topup:
          type === 'stripe' && normalizedMinTopup <= 0
            ? stripeMinTopup
            : normalizedMinTopup,
      }
    })
    .filter((item) => item.name && item.type && item.type !== 'waffo')
}

const GMPAY_NETWORK_ALIASES: Record<string, string> = {
  tron: 'tron',
  trc20: 'tron',
  'trc-20': 'tron',
  ethereum: 'ethereum',
  eth: 'ethereum',
  erc20: 'ethereum',
  'erc-20': 'ethereum',
  solana: 'solana',
  sol: 'solana',
  spl: 'solana',
  binance: 'binance',
  bsc: 'binance',
  bnb: 'binance',
  bep20: 'binance',
  'bep-20': 'binance',
  'binance-smart-chain': 'binance',
}

const GMPAY_NETWORK_DISPLAY_NAMES: Record<string, string> = {
  tron: 'TRON',
  ethereum: 'Ethereum',
  solana: 'Solana',
  binance: 'BSC',
}

const GMPAY_SUPPORTED_TOKENS = new Set(['USDT', 'USDC'])

/**
 * Keep the wallet selector aligned with the international product contract.
 * EPUSDT exposes a network together with every enabled token. The backend
 * applies the same stablecoin/network allowlist; repeating it here protects
 * the UI from stale or older gateway responses while preserving each token /
 * network pair for the two-level selector.
 *
 * The parser accepts both the current flattened `{ token }` response and the
 * grouped `{ tokens }` form used by older gateway versions so a rolling
 * deployment does not briefly expose native assets such as TRX or SOL. The
 * result is deduplicated by token + network, rather than by network alone, so
 * USDT and USDC can intentionally coexist on one chain.
 */
export function parseCryptoAssets(data: unknown): CryptoAsset[] | undefined {
  if (data === undefined || data === null) {
    return undefined
  }

  const assetsByPair = new Map<string, CryptoAsset>()

  for (const item of parseJsonArray(data)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }

    const record = item as Record<string, unknown>
    const rawNetwork =
      typeof record.network === 'string' ? record.network.trim() : ''
    const network = GMPAY_NETWORK_ALIASES[rawNetwork.toLowerCase()]
    if (!network) continue

    const tokens: string[] = []
    if (typeof record.token === 'string') {
      tokens.push(record.token)
    }
    for (const token of parseJsonArray(record.tokens)) {
      if (typeof token === 'string') tokens.push(token)
    }

    const fallbackDisplayName = GMPAY_NETWORK_DISPLAY_NAMES[network]
    if (!fallbackDisplayName) continue
    const configuredDisplayName =
      typeof record.display_name === 'string' ? record.display_name.trim() : ''
    const displayName = configuredDisplayName || fallbackDisplayName

    for (const rawToken of tokens) {
      const token = rawToken.trim().toUpperCase()
      if (!GMPAY_SUPPORTED_TOKENS.has(token)) continue

      const pairKey = `${token}:${network}`
      if (assetsByPair.has(pairKey)) continue

      assetsByPair.set(pairKey, {
        network,
        token: token as CryptoAsset['token'],
        display_name: displayName,
      })
    }
  }

  return [...assetsByPair.values()]
}

function parseWaffoPayMethods(data: unknown): WaffoPayMethod[] {
  return parseJsonArray(data)
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object'
    )
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name : '',
      icon: typeof item.icon === 'string' ? item.icon : undefined,
      payMethodType:
        typeof item.payMethodType === 'string' ? item.payMethodType : undefined,
      payMethodName:
        typeof item.payMethodName === 'string' ? item.payMethodName : undefined,
    }))
    .filter((item) => item.name)
}

function parseCreemProducts(data: unknown): CreemProduct[] {
  return parseJsonArray(data)
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object'
    )
    .map((item) => {
      const currency: CreemProduct['currency'] =
        item.currency === 'EUR' ? 'EUR' : 'USD'

      return {
        name: typeof item.name === 'string' ? item.name : '',
        productId: typeof item.productId === 'string' ? item.productId : '',
        price: Number(item.price) || 0,
        quota: Number(item.quota) || 0,
        currency,
      }
    })
    .filter((item) => item.name && item.productId)
}

function parseAmountOptions(data: unknown): number[] {
  return parseJsonArray(data)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
}

function parseDiscountMap(data: unknown): Record<number, number> {
  if (!data) {
    return {}
  }

  let parsedData = data

  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data)
    } catch {
      return {}
    }
  }

  if (
    !parsedData ||
    typeof parsedData !== 'object' ||
    Array.isArray(parsedData)
  ) {
    return {}
  }

  return Object.entries(parsedData).reduce<Record<number, number>>(
    (result, [key, value]) => {
      const numericKey = Number(key)
      const numericValue = Number(value)

      if (Number.isFinite(numericKey) && Number.isFinite(numericValue)) {
        result[numericKey] = numericValue
      }

      return result
    },
    {}
  )
}

export function useTopupInfo() {
  const [topupInfo, setTopupInfo] = useState<TopupInfo | null>(null)
  const [presetAmounts, setPresetAmounts] = useState<PresetAmount[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTopupInfo = useCallback(async () => {
    try {
      setLoading(true)

      const response = await getTopupInfo()

      if (!response.success || !response.data) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch topup info:', response.message)
        return
      }

      const processedData: TopupInfo = {
        ...response.data,
        pay_methods: parsePaymentMethods(
          response.data.pay_methods,
          response.data.stripe_min_topup
        ),
        crypto_assets: parseCryptoAssets(response.data.crypto_assets),
        amount_options: parseAmountOptions(response.data.amount_options),
        discount: parseDiscountMap(response.data.discount),
        creem_products: parseCreemProducts(response.data.creem_products),
        waffo_pay_methods: parseWaffoPayMethods(
          response.data.waffo_pay_methods
        ),
      }

      setTopupInfo(processedData)

      if (processedData.amount_options.length > 0) {
        const customPresets = mergePresetAmounts(
          processedData.amount_options,
          processedData.discount || {}
        )
        setPresetAmounts(customPresets)
      } else {
        const minTopup = getMinTopupAmount(processedData)
        const defaultPresets = generatePresetAmounts(minTopup)
        setPresetAmounts(defaultPresets)
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch topup info:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (!cancelled) void fetchTopupInfo()
    })

    return () => {
      cancelled = true
    }
  }, [fetchTopupInfo])

  return {
    topupInfo,
    presetAmounts,
    loading,
    refetch: fetchTopupInfo,
  }
}
