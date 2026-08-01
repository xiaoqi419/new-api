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
import * as z from 'zod'

import { combineBillingExpr } from '@/features/pricing/lib/billing-expr'

import { safeJsonParse } from '../utils/json-parser'
import { formatPricingNumber } from './pricing-format'

export const createModelPricingSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(1, t('Model name is required')),
    price: z.string().optional(),
    ratio: z.string().optional(),
    cacheRatio: z.string().optional(),
    createCacheRatio: z.string().optional(),
    completionRatio: z.string().optional(),
    imageRatio: z.string().optional(),
    audioRatio: z.string().optional(),
    audioCompletionRatio: z.string().optional(),
  })

export type ModelPricingFormValues = z.infer<
  ReturnType<typeof createModelPricingSchema>
>

export type PricingMode = 'per-token' | 'per-request' | 'tiered_expr'

export type LaneKey =
  | 'completion'
  | 'cache'
  | 'createCache'
  | 'image'
  | 'audioInput'
  | 'audioOutput'

export type ModelRatioData = {
  name: string
  price?: string
  ratio?: string
  cacheRatio?: string
  createCacheRatio?: string
  completionRatio?: string
  imageRatio?: string
  audioRatio?: string
  audioCompletionRatio?: string
  billingMode?: PricingMode
  billingExpr?: string
  requestRuleExpr?: string
  /** Serialized `VideoPriceTiers` entry for this model, empty when unused. */
  videoPriceTiers?: string
}

export type VideoPriceTierDraft = {
  id: string
  resolution: string
  hasVideo: boolean
  hasAudio: boolean
  price: string
}

export type VideoPriceDraft = {
  enabled: boolean
  basePrice: string
  tiers: VideoPriceTierDraft[]
}

type VideoPriceTierJson = {
  resolution?: string
  has_video?: boolean
  has_audio?: boolean
  price?: number
}

type VideoPriceConfigJson = {
  base_price?: number
  tiers?: VideoPriceTierJson[]
}

export const EMPTY_VIDEO_PRICE_DRAFT: VideoPriceDraft = {
  enabled: false,
  basePrice: '',
  tiers: [],
}

// Row identity has to survive reordering and deletion, so it cannot be derived
// from the row contents (two tiers may legitimately share a price).
let videoTierDraftSeed = 0

export function createVideoPriceTierDraft(): VideoPriceTierDraft {
  videoTierDraftSeed += 1
  return {
    id: `video-tier-${videoTierDraftSeed}`,
    resolution: '',
    hasVideo: false,
    hasAudio: false,
    price: '',
  }
}

export function parseVideoPriceDraft(json?: string): VideoPriceDraft {
  if (!json) return { ...EMPTY_VIDEO_PRICE_DRAFT, tiers: [] }

  const parsed = safeJsonParse<VideoPriceConfigJson | null>(json, {
    fallback: null,
    silent: true,
  })
  if (!parsed || typeof parsed !== 'object') {
    return { ...EMPTY_VIDEO_PRICE_DRAFT, tiers: [] }
  }

  const tiers = (Array.isArray(parsed.tiers) ? parsed.tiers : []).map(
    (tier) => ({
      ...createVideoPriceTierDraft(),
      resolution: typeof tier.resolution === 'string' ? tier.resolution : '',
      hasVideo: tier.has_video === true,
      hasAudio: tier.has_audio === true,
      price: formatPricingNumber(tier.price),
    })
  )

  return {
    enabled: true,
    basePrice: formatPricingNumber(parsed.base_price),
    tiers,
  }
}

export function serializeVideoPriceDraft(draft: VideoPriceDraft): string {
  if (!draft.enabled) return ''

  const basePrice = toNumberOrNull(draft.basePrice)
  if (basePrice === null || basePrice <= 0) return ''

  const tiers = draft.tiers.reduce<VideoPriceTierJson[]>((acc, tier) => {
    const price = toNumberOrNull(tier.price)
    if (price === null || price <= 0) return acc

    const entry: VideoPriceTierJson = {}
    const resolution = tier.resolution.trim()
    if (resolution) entry.resolution = resolution
    if (tier.hasVideo) entry.has_video = true
    if (tier.hasAudio) entry.has_audio = true
    entry.price = price
    acc.push(entry)
    return acc
  }, [])

  if (tiers.length === 0) return ''
  return JSON.stringify({ base_price: basePrice, tiers })
}

/**
 * Canonical form of a stored video tier config, used to compare a saved value
 * against a freshly serialized draft. The backend marshals the same data with
 * its own key order and spacing, so comparing raw strings would report an
 * untouched model as edited.
 */
export function canonicalizeVideoPriceTiers(json?: string): string {
  const parsed = safeJsonParse<VideoPriceConfigJson | null>(json ?? '', {
    fallback: null,
    silent: true,
  })
  if (!parsed || typeof parsed !== 'object') return ''

  const basePrice = toNumberOrNull(parsed.base_price)
  if (basePrice === null || basePrice <= 0) return ''

  const tiers = (Array.isArray(parsed.tiers) ? parsed.tiers : []).reduce<
    VideoPriceTierJson[]
  >((acc, tier) => {
    const price = toNumberOrNull(tier?.price)
    if (price === null || price <= 0) return acc

    const entry: VideoPriceTierJson = {}
    const resolution =
      typeof tier?.resolution === 'string' ? tier.resolution.trim() : ''
    if (resolution) entry.resolution = resolution
    if (tier?.has_video === true) entry.has_video = true
    if (tier?.has_audio === true) entry.has_audio = true
    entry.price = price
    acc.push(entry)
    return acc
  }, [])

  if (tiers.length === 0) return ''
  return JSON.stringify({ base_price: basePrice, tiers })
}

/**
 * Mirrors the backend validation in `validateVideoPriceConfig` so admins get a
 * localized message before the whole option is rejected server-side.
 */
export function getVideoPriceDraftError(draft: VideoPriceDraft): string | null {
  if (!draft.enabled || draft.tiers.length === 0) return null

  const basePrice = toNumberOrNull(draft.basePrice)
  if (basePrice === null || basePrice <= 0) {
    return 'Video tier pricing needs a base price greater than 0.'
  }

  const seen = new Set<string>()
  for (const tier of draft.tiers) {
    const price = toNumberOrNull(tier.price)
    if (price === null || price <= 0) {
      return 'Every video tier price must be greater than 0.'
    }
    const key = `${tier.resolution.trim().toLowerCase()}|${tier.hasVideo}|${tier.hasAudio}`
    if (seen.has(key)) {
      return 'Two video tiers share the same resolution and input/output conditions.'
    }
    seen.add(key)
  }

  return null
}

export function getVideoTierRatioLabel(
  basePrice: string,
  price: string
): string {
  const baseNumber = toNumberOrNull(basePrice)
  const priceNumber = toNumberOrNull(price)
  if (baseNumber === null || baseNumber <= 0 || priceNumber === null) return ''
  // 只作为可读性提示,截到 4 位小数；参与计费的仍是后端按原价现算的比值。
  return `×${Number((priceNumber / baseNumber).toFixed(4))}`
}

export type PreviewRow = {
  key: string
  label: string
  value: string
  multiline?: boolean
}

export const numericDraftRegex = /^(\d+(\.\d*)?|\.\d*)?$/

export const EMPTY_LANE_PRICES: Record<LaneKey, string> = {
  completion: '',
  cache: '',
  createCache: '',
  image: '',
  audioInput: '',
  audioOutput: '',
}

export const EMPTY_LANE_ENABLED: Record<LaneKey, boolean> = {
  completion: false,
  cache: false,
  createCache: false,
  image: false,
  audioInput: false,
  audioOutput: false,
}

export const ratioFieldByLane: Record<LaneKey, keyof ModelPricingFormValues> = {
  completion: 'completionRatio',
  cache: 'cacheRatio',
  createCache: 'createCacheRatio',
  image: 'imageRatio',
  audioInput: 'audioRatio',
  audioOutput: 'audioCompletionRatio',
}

export const laneConfigs: Array<{
  key: LaneKey
  titleKey: string
  descriptionKey: string
  placeholder: string
}> = [
  {
    key: 'completion',
    titleKey: 'Completion price',
    descriptionKey: 'Output token price for generated tokens.',
    placeholder: '15',
  },
  {
    key: 'cache',
    titleKey: 'Cache read price',
    descriptionKey: 'Token price for cache reads.',
    placeholder: '0.3',
  },
  {
    key: 'createCache',
    titleKey: 'Cache write price',
    descriptionKey: 'Token price for creating cache entries.',
    placeholder: '3.75',
  },
  {
    key: 'image',
    titleKey: 'Image input price',
    descriptionKey: 'Token price for image input.',
    placeholder: '2.5',
  },
  {
    key: 'audioInput',
    titleKey: 'Audio input price',
    descriptionKey: 'Token price for audio input.',
    placeholder: '3.81',
  },
  {
    key: 'audioOutput',
    titleKey: 'Audio output price',
    descriptionKey: 'Token price for audio output.',
    placeholder: '15.11',
  },
]

export function hasValue(value: unknown): boolean {
  return (
    value !== '' && value !== null && value !== undefined && value !== false
  )
}

export function toNumberOrNull(value: unknown): number | null {
  if (!hasValue(value) && value !== 0) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function ratioToBasePrice(ratio: unknown): string {
  const num = toNumberOrNull(ratio)
  if (num === null) return ''
  return formatPricingNumber(num * 2)
}

function deriveLanePrice(
  ratio: unknown,
  denominator: unknown,
  fallback = ''
): string {
  const ratioNumber = toNumberOrNull(ratio)
  const denominatorNumber = toNumberOrNull(denominator)
  if (ratioNumber === null || denominatorNumber === null) return fallback
  return formatPricingNumber(ratioNumber * denominatorNumber)
}

export function createInitialLaneState(data?: ModelRatioData | null) {
  if (!data) {
    return {
      promptPrice: '',
      prices: { ...EMPTY_LANE_PRICES },
      enabled: { ...EMPTY_LANE_ENABLED },
    }
  }

  const promptPrice = ratioToBasePrice(data.ratio)
  const audioInputPrice = deriveLanePrice(data.audioRatio, promptPrice)
  const prices: Record<LaneKey, string> = {
    completion: deriveLanePrice(data.completionRatio, promptPrice),
    cache: deriveLanePrice(data.cacheRatio, promptPrice),
    createCache: deriveLanePrice(data.createCacheRatio, promptPrice),
    image: deriveLanePrice(data.imageRatio, promptPrice),
    audioInput: audioInputPrice,
    audioOutput: deriveLanePrice(data.audioCompletionRatio, audioInputPrice),
  }

  return {
    promptPrice,
    prices,
    enabled: {
      completion: hasValue(data.completionRatio),
      cache: hasValue(data.cacheRatio),
      createCache: hasValue(data.createCacheRatio),
      image: hasValue(data.imageRatio),
      audioInput: hasValue(data.audioRatio),
      audioOutput: hasValue(data.audioCompletionRatio),
    },
  }
}

export function buildPreviewRows(
  values: ModelPricingFormValues,
  mode: PricingMode,
  billingExpr: string,
  requestRuleExpr: string,
  promptPrice: string,
  lanePrices: Record<LaneKey, string>,
  laneEnabled: Record<LaneKey, boolean>,
  videoPrice: VideoPriceDraft,
  t: (key: string) => string
): PreviewRow[] {
  if (mode === 'tiered_expr') {
    const effectiveExpr = combineBillingExpr(billingExpr, requestRuleExpr)
    return [
      { key: 'mode', label: 'BillingMode', value: 'tiered_expr' },
      {
        key: 'expr',
        label: t('Expression'),
        value: effectiveExpr || t('Empty'),
        multiline: true,
      },
    ]
  }

  if (mode === 'per-request') {
    return [
      {
        key: 'price',
        label: 'ModelPrice',
        value: values.price || t('Empty'),
      },
    ]
  }

  return [
    {
      key: 'inputPrice',
      label: t('Input price'),
      value: promptPrice ? `$${promptPrice}` : t('Empty'),
    },
    {
      key: 'completion',
      label: t('Completion price'),
      value:
        laneEnabled.completion && lanePrices.completion
          ? `$${lanePrices.completion}`
          : t('Empty'),
    },
    {
      key: 'cache',
      label: t('Cache read price'),
      value:
        laneEnabled.cache && lanePrices.cache
          ? `$${lanePrices.cache}`
          : t('Empty'),
    },
    {
      key: 'createCache',
      label: t('Cache write price'),
      value:
        laneEnabled.createCache && lanePrices.createCache
          ? `$${lanePrices.createCache}`
          : t('Empty'),
    },
    {
      key: 'image',
      label: t('Image input price'),
      value:
        laneEnabled.image && lanePrices.image
          ? `$${lanePrices.image}`
          : t('Empty'),
    },
    {
      key: 'audio',
      label: t('Audio input price'),
      value:
        laneEnabled.audioInput && lanePrices.audioInput
          ? `$${lanePrices.audioInput}`
          : t('Empty'),
    },
    {
      key: 'audioCompletion',
      label: t('Audio output price'),
      value:
        laneEnabled.audioOutput && lanePrices.audioOutput
          ? `$${lanePrices.audioOutput}`
          : t('Empty'),
    },
    {
      key: 'videoPriceTiers',
      label: t('Video tier pricing'),
      value:
        videoPrice.enabled && videoPrice.tiers.length > 0
          ? `${videoPrice.tiers.length} ${t('tiers')}`
          : t('Empty'),
    },
  ]
}
