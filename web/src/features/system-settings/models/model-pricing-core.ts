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
  /** Serialized `ImagePriceTiers` entry for this model, empty when unused. */
  imagePriceTiers?: string
}

/**
 * Which dimensions a model is priced by. Vendors publish a video price table
 * whose axes differ per model (Seedance 2.0 varies by resolution and video
 * input, 1.5 pro only by audio output), so the editor mirrors that table
 * instead of asking for one abstract tier at a time.
 */
export type VideoPriceAxes = {
  resolution: boolean
  videoInput: boolean
  audioOutput: boolean
}

/** Column identity inside a row: video-input flag then audio-output flag. */
export type VideoPriceCellKey = '--' | '-a' | 'v-' | 'va'

export type VideoPriceMatrixRow = {
  id: string
  /** Empty on the base row, which covers every resolution not listed. */
  resolution: string
  prices: Record<VideoPriceCellKey, string>
}

export type VideoPriceMatrixDraft = {
  enabled: boolean
  axes: VideoPriceAxes
  /** `rows[0]` is always the base row. */
  rows: VideoPriceMatrixRow[]
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

const EMPTY_VIDEO_PRICE_CELLS: Record<VideoPriceCellKey, string> = {
  '--': '',
  '-a': '',
  'v-': '',
  va: '',
}

// Row identity has to survive reordering and deletion, so it cannot be derived
// from the row contents (two rows may legitimately hold the same prices).
let videoRowDraftSeed = 0

export function createVideoPriceMatrixRow(
  resolution = ''
): VideoPriceMatrixRow {
  videoRowDraftSeed += 1
  return {
    id: `video-row-${videoRowDraftSeed}`,
    resolution,
    prices: { ...EMPTY_VIDEO_PRICE_CELLS },
  }
}

export function createEmptyVideoPriceMatrix(): VideoPriceMatrixDraft {
  return {
    enabled: false,
    axes: { resolution: false, videoInput: false, audioOutput: false },
    rows: [createVideoPriceMatrixRow()],
  }
}

export function videoPriceCellKey(
  hasVideo: boolean,
  hasAudio: boolean
): VideoPriceCellKey {
  if (hasVideo && hasAudio) return 'va'
  if (hasVideo) return 'v-'
  if (hasAudio) return '-a'
  return '--'
}

/**
 * Columns to render for the enabled axes. Video input is the outer grouping so
 * the layout matches how vendors publish the table.
 */
export function videoPriceColumns(
  axes: VideoPriceAxes
): { key: VideoPriceCellKey; hasVideo: boolean; hasAudio: boolean }[] {
  const videoStates = axes.videoInput ? [false, true] : [false]
  const audioStates = axes.audioOutput ? [false, true] : [false]
  const columns: {
    key: VideoPriceCellKey
    hasVideo: boolean
    hasAudio: boolean
  }[] = []
  for (const hasVideo of videoStates) {
    for (const hasAudio of audioStates) {
      columns.push({
        key: videoPriceCellKey(hasVideo, hasAudio),
        hasVideo,
        hasAudio,
      })
    }
  }
  return columns
}

/**
 * Turning an axis off drops the cells it exposed instead of hiding them, so a
 * saved payload never carries a tier the admin can no longer see.
 */
export function setVideoPriceAxis(
  draft: VideoPriceMatrixDraft,
  axis: keyof VideoPriceAxes,
  enabled: boolean
): VideoPriceMatrixDraft {
  const axes = { ...draft.axes, [axis]: enabled }
  if (enabled) return { ...draft, axes }

  if (axis === 'resolution') {
    // Without the resolution axis every row would describe the same conditions,
    // so only the first one can survive.
    return {
      ...draft,
      axes,
      rows: [{ ...draft.rows[0], resolution: '' }],
    }
  }
  const cleared: VideoPriceCellKey[] =
    axis === 'videoInput' ? ['v-', 'va'] : ['-a', 'va']
  return {
    ...draft,
    axes,
    rows: draft.rows.map((row) => {
      const prices = { ...row.prices }
      for (const key of cleared) prices[key] = ''
      return { ...row, prices }
    }),
  }
}

/**
 * Deterministic tier order shared by serialization and canonicalization, so two
 * payloads describing the same price table always produce the same string.
 */
function sortVideoPriceTiers(
  tiers: VideoPriceTierJson[]
): VideoPriceTierJson[] {
  return [...tiers].sort((left, right) => {
    const leftResolution = left.resolution ?? ''
    const rightResolution = right.resolution ?? ''
    if (leftResolution !== rightResolution) {
      return leftResolution < rightResolution ? -1 : 1
    }
    if ((left.has_video === true) !== (right.has_video === true)) {
      return left.has_video === true ? 1 : -1
    }
    if ((left.has_audio === true) !== (right.has_audio === true)) {
      return left.has_audio === true ? 1 : -1
    }
    return 0
  })
}

function buildVideoPriceTierJson(
  resolution: string,
  hasVideo: boolean,
  hasAudio: boolean,
  price: number
): VideoPriceTierJson {
  const entry: VideoPriceTierJson = {}
  if (resolution) entry.resolution = resolution
  if (hasVideo) entry.has_video = true
  if (hasAudio) entry.has_audio = true
  entry.price = price
  return entry
}

/**
 * Lays a stored config out as the vendor's price table. Every cell holds the
 * final unit price in the same currency-per-1M-tokens unit as the model's own
 * input price.
 *
 * `promptPrice` is that input price, and it is what anchors the stored ratios.
 * Configs written before this form existed anchored them to their own
 * `base_price` (the vendor's list price for the un-itemized combination), so
 * their cells are rescaled here. That turns the vendor list prices into the
 * prices actually being charged today, which is what the admin needs to see
 * before editing anything.
 */
export function parseVideoPriceMatrix(
  json?: string,
  promptPrice?: string
): VideoPriceMatrixDraft {
  if (!json) return createEmptyVideoPriceMatrix()

  const parsed = safeJsonParse<VideoPriceConfigJson | null>(json, {
    fallback: null,
    silent: true,
  })
  if (!parsed || typeof parsed !== 'object') {
    return createEmptyVideoPriceMatrix()
  }

  const anchor = toNumberOrNull(promptPrice)
  const storedAnchor = toNumberOrNull(parsed.base_price)
  const rescale =
    anchor !== null && anchor > 0 && storedAnchor !== null && storedAnchor > 0
      ? anchor / storedAnchor
      : 1
  // Rescaling turns a clean list price into something like 27.351351351351;
  // six decimals is a fraction of a cent per million tokens, and an editable
  // number the admin can actually read.
  const rescalePrice = (price: number) =>
    formatPricingNumber(
      rescale === 1 ? price : Number((price * rescale).toFixed(6))
    )

  const tiers = (Array.isArray(parsed.tiers) ? parsed.tiers : []).filter(
    (tier) => toNumberOrNull(tier?.price) !== null
  )

  const rows: VideoPriceMatrixRow[] = []
  const rowFor = (resolution: string) => {
    const normalized = resolution.trim().toLowerCase()
    const existing = rows.find(
      (candidate) => candidate.resolution.trim().toLowerCase() === normalized
    )
    if (existing) return existing
    const created = createVideoPriceMatrixRow(resolution)
    rows.push(created)
    return created
  }

  for (const tier of tiers) {
    const resolution =
      typeof tier.resolution === 'string' ? tier.resolution.trim() : ''
    rowFor(resolution).prices[
      videoPriceCellKey(tier.has_video === true, tier.has_audio === true)
    ] = rescalePrice(tier.price as number)
  }

  if (rows.length === 0) rows.push(createVideoPriceMatrixRow())

  return {
    enabled: true,
    axes: {
      resolution: tiers.some(
        (tier) => typeof tier.resolution === 'string' && tier.resolution.trim()
      ),
      videoInput: tiers.some((tier) => tier.has_video === true),
      audioOutput: tiers.some((tier) => tier.has_audio === true),
    },
    rows,
  }
}

/**
 * Stores the matrix as tier prices anchored to `promptPrice`. The backend
 * divides each tier price by `base_price` to get the billing multiplier, so
 * writing the model's own input price as the anchor is what makes every cell
 * behave as an absolute unit price.
 */
export function serializeVideoPriceMatrix(
  draft: VideoPriceMatrixDraft,
  promptPrice?: string
): string {
  if (!draft.enabled) return ''

  const anchor = toNumberOrNull(promptPrice)
  if (anchor === null || anchor <= 0) return ''

  const columns = videoPriceColumns(draft.axes)
  const tiers: VideoPriceTierJson[] = []
  for (const row of draft.rows) {
    const resolution = draft.axes.resolution ? row.resolution.trim() : ''
    for (const column of columns) {
      const price = toNumberOrNull(row.prices[column.key])
      if (price === null || price <= 0) continue
      tiers.push(
        buildVideoPriceTierJson(
          resolution,
          column.hasVideo,
          column.hasAudio,
          price
        )
      )
    }
  }

  if (tiers.length === 0) return ''
  // Row order is the admin's, not ours: the table is read top to bottom, and a
  // reload that reshuffles it looks like the form lost the edit. Nothing downstream
  // depends on the order — the backend matches tiers by shape, and the
  // unsaved-changes check compares canonical forms.
  return JSON.stringify({ base_price: anchor, tiers })
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

    acc.push(
      buildVideoPriceTierJson(
        typeof tier?.resolution === 'string' ? tier.resolution.trim() : '',
        tier?.has_video === true,
        tier?.has_audio === true,
        price
      )
    )
    return acc
  }, [])

  if (tiers.length === 0) return ''
  return JSON.stringify({
    base_price: basePrice,
    tiers: sortVideoPriceTiers(tiers),
  })
}

/**
 * Mirrors the backend validation in `validateVideoPriceConfig`. Blank cells are
 * legitimate — they mean the vendor does not price that combination
 * separately, so the request falls back to the model's own input price.
 */
export function getVideoPriceMatrixError(
  draft: VideoPriceMatrixDraft,
  promptPrice?: string
): string | null {
  if (!draft.enabled) return null

  const columns = videoPriceColumns(draft.axes)

  if (draft.axes.resolution) {
    // A blank resolution is a legitimate value: that row prices every output
    // resolution the table does not list. But two such rows serialize into the
    // same condition, which the backend rejects as a duplicate.
    const seen = new Set<string>()
    for (const row of draft.rows) {
      const normalized = row.resolution.trim().toLowerCase()
      if (seen.has(normalized)) {
        return 'Two rows use the same output resolution.'
      }
      seen.add(normalized)
    }
  }

  let hasPricedCell = false
  for (const row of draft.rows) {
    for (const column of columns) {
      const raw = row.prices[column.key].trim()
      if (raw === '') continue
      hasPricedCell = true
      const price = toNumberOrNull(raw)
      if (price === null || price <= 0) {
        return 'Every video tier price must be greater than 0.'
      }
    }
  }

  if (!hasPricedCell) return null

  // Tier prices are stored relative to the model's input price, so without one
  // there is nothing to anchor them to and the table cannot be saved at all.
  const anchor = toNumberOrNull(promptPrice)
  if (anchor === null || anchor <= 0) {
    return 'Set the input price before pricing video tiers.'
  }

  return null
}

export function getTierRatioLabel(basePrice: string, price: string): string {
  const baseNumber = toNumberOrNull(basePrice)
  const priceNumber = toNumberOrNull(price)
  if (baseNumber === null || baseNumber <= 0 || priceNumber === null) return ''
  // 只作为可读性提示,截到 4 位小数；参与计费的仍是后端按原价现算的比值。
  return `×${Number((priceNumber / baseNumber).toFixed(4))}`
}

/**
 * One row of a model's image price table. Vendors publish image prices as a
 * flat list (Seedream 1K/2K/4K, DALL·E 3 standard/hd) and `quality` is an open
 * vendor string rather than a fixed set, so the editor keeps one row per priced
 * combination instead of a matrix like video pricing uses.
 */
export type ImagePriceTierRow = {
  id: string
  /** Blank prices every request size the table does not list. */
  size: string
  /** Blank prices every quality the table does not list. */
  quality: string
  price: string
}

export type ImagePriceTiersDraft = {
  enabled: boolean
  /** Size the model's own fixed price covers, required once a row names a size. */
  baseSize: string
  rows: ImagePriceTierRow[]
}

type ImagePriceTierJson = {
  size?: string
  quality?: string
  price?: number
}

type ImagePriceConfigJson = {
  base_size?: string
  base_price?: number
  tiers?: ImagePriceTierJson[]
}

/** Matches the backend `maxImageSideLength` bound on a single edge. */
const MAX_IMAGE_SIDE_LENGTH = 1 << 16

// Row identity has to survive reordering and deletion, so it cannot be derived
// from the row contents (two rows may legitimately hold the same price).
let imageRowDraftSeed = 0

export function createImagePriceTierRow(
  size = '',
  quality = '',
  price = ''
): ImagePriceTierRow {
  imageRowDraftSeed += 1
  return { id: `image-row-${imageRowDraftSeed}`, size, quality, price }
}

export function createEmptyImagePriceTiers(): ImagePriceTiersDraft {
  return { enabled: false, baseSize: '', rows: [createImagePriceTierRow()] }
}

/**
 * Pixel count a size notation stands for, mirroring the backend `imageSizePixels`.
 * Vendors name the same tier as `2K` or as `2048x2048`, so tiers are compared by
 * pixel count instead of by string.
 */
function imageSizePixels(size: string): number | null {
  const value = size.trim().toLowerCase()
  if (!value) return null

  // `nK` is the vendor shorthand for a square tier whose edge is n*1024.
  const tierName = /^(\d+)k$/.exec(value)
  if (tierName) {
    const side = Number(tierName[1]) * 1024
    if (side <= 0 || side > MAX_IMAGE_SIDE_LENGTH) return null
    return side * side
  }

  const dimensions = /^(\d+)\s*[x*×]\s*(\d+)$/.exec(value)
  if (!dimensions) return null
  const width = Number(dimensions[1])
  const height = Number(dimensions[2])
  if (width <= 0 || height <= 0) return null
  if (width > MAX_IMAGE_SIDE_LENGTH || height > MAX_IMAGE_SIDE_LENGTH) {
    return null
  }
  return width * height
}

function buildImagePriceTierJson(
  size: string,
  quality: string,
  price: number
): ImagePriceTierJson {
  const entry: ImagePriceTierJson = {}
  if (size) entry.size = size
  if (quality) entry.quality = quality
  entry.price = price
  return entry
}

function buildImagePriceConfigJson(
  baseSize: string,
  basePrice: number,
  tiers: ImagePriceTierJson[]
): ImagePriceConfigJson {
  const config: ImagePriceConfigJson = {}
  if (baseSize) config.base_size = baseSize
  config.base_price = basePrice
  config.tiers = tiers
  return config
}

/**
 * Deterministic tier order shared by serialization and canonicalization, so two
 * payloads describing the same price table always produce the same string.
 */
function sortImagePriceTiers(
  tiers: ImagePriceTierJson[]
): ImagePriceTierJson[] {
  return [...tiers].sort((left, right) => {
    const leftSize = left.size ?? ''
    const rightSize = right.size ?? ''
    if (leftSize !== rightSize) return leftSize < rightSize ? -1 : 1
    const leftQuality = left.quality ?? ''
    const rightQuality = right.quality ?? ''
    if (leftQuality !== rightQuality) return leftQuality < rightQuality ? -1 : 1
    return 0
  })
}

/**
 * Lays a stored config out as the vendor's price table. Every row holds the
 * final unit price of that size/quality combination, in the same per-request
 * USD unit as the model's own fixed price.
 *
 * `basePrice` is that fixed price, and it is what anchors the stored ratios.
 * Configs written before this form existed anchored them to their own
 * `base_price` (the vendor's list price for the base tier), so their rows are
 * rescaled here. That turns vendor list prices into the prices actually being
 * charged today, which is what the admin needs to see before editing anything.
 */
export function parseImagePriceTiers(
  json?: string,
  basePrice?: string
): ImagePriceTiersDraft {
  if (!json) return createEmptyImagePriceTiers()

  const parsed = safeJsonParse<ImagePriceConfigJson | null>(json, {
    fallback: null,
    silent: true,
  })
  if (!parsed || typeof parsed !== 'object') {
    return createEmptyImagePriceTiers()
  }

  const anchor = toNumberOrNull(basePrice)
  const storedAnchor = toNumberOrNull(parsed.base_price)
  const rescale =
    anchor !== null && anchor > 0 && storedAnchor !== null && storedAnchor > 0
      ? anchor / storedAnchor
      : 1
  // Rescaling turns a clean list price into something like 0.008888888889; six
  // decimals is a millionth of a dollar per request, and an editable number the
  // admin can actually read.
  const rescalePrice = (price: number) =>
    formatPricingNumber(
      rescale === 1 ? price : Number((price * rescale).toFixed(6))
    )

  const rows = (Array.isArray(parsed.tiers) ? parsed.tiers : [])
    .filter((tier) => toNumberOrNull(tier?.price) !== null)
    .map((tier) =>
      createImagePriceTierRow(
        typeof tier.size === 'string' ? tier.size.trim() : '',
        typeof tier.quality === 'string' ? tier.quality.trim() : '',
        rescalePrice(tier.price as number)
      )
    )

  if (rows.length === 0) rows.push(createImagePriceTierRow())

  return {
    enabled: true,
    baseSize:
      typeof parsed.base_size === 'string' ? parsed.base_size.trim() : '',
    rows,
  }
}

/**
 * Stores the table as tier prices anchored to `basePrice`. The backend divides
 * each tier price by `base_price` to get the billing multiplier, so writing the
 * model's own fixed price as the anchor is what makes every row behave as an
 * absolute unit price.
 */
export function serializeImagePriceTiers(
  draft: ImagePriceTiersDraft,
  basePrice?: string
): string {
  if (!draft.enabled) return ''

  const anchor = toNumberOrNull(basePrice)
  if (anchor === null || anchor <= 0) return ''

  const tiers: ImagePriceTierJson[] = []
  for (const row of draft.rows) {
    const price = toNumberOrNull(row.price)
    if (price === null || price <= 0) continue
    tiers.push(
      buildImagePriceTierJson(row.size.trim(), row.quality.trim(), price)
    )
  }

  if (tiers.length === 0) return ''
  // Row order is the admin's, not ours: the table is read top to bottom, and a
  // reload that reshuffles it looks like the form lost the edit. Nothing
  // downstream depends on the order — the backend matches tiers by shape, and
  // the unsaved-changes check compares canonical forms.
  return JSON.stringify(
    buildImagePriceConfigJson(draft.baseSize.trim(), anchor, tiers)
  )
}

/**
 * Canonical form of a stored image tier config, used to compare a saved value
 * against a freshly serialized draft. The backend marshals the same data with
 * its own key order and spacing, so comparing raw strings would report an
 * untouched model as edited.
 */
export function canonicalizeImagePriceTiers(json?: string): string {
  const parsed = safeJsonParse<ImagePriceConfigJson | null>(json ?? '', {
    fallback: null,
    silent: true,
  })
  if (!parsed || typeof parsed !== 'object') return ''

  const basePrice = toNumberOrNull(parsed.base_price)
  if (basePrice === null || basePrice <= 0) return ''

  const tiers = (Array.isArray(parsed.tiers) ? parsed.tiers : []).reduce<
    ImagePriceTierJson[]
  >((acc, tier) => {
    const price = toNumberOrNull(tier?.price)
    if (price === null || price <= 0) return acc

    acc.push(
      buildImagePriceTierJson(
        typeof tier?.size === 'string' ? tier.size.trim() : '',
        typeof tier?.quality === 'string' ? tier.quality.trim() : '',
        price
      )
    )
    return acc
  }, [])

  if (tiers.length === 0) return ''
  return JSON.stringify(
    buildImagePriceConfigJson(
      typeof parsed.base_size === 'string' ? parsed.base_size.trim() : '',
      basePrice,
      sortImagePriceTiers(tiers)
    )
  )
}

/**
 * Mirrors the backend validation in `validateImagePriceConfig`. A row is only
 * ignored when it is entirely blank; anything the admin started filling in must
 * be valid, because serialization drops rows without a usable price and the
 * config would otherwise disappear on save without a word.
 */
export function getImagePriceTiersError(
  draft: ImagePriceTiersDraft,
  basePrice?: string
): string | null {
  if (!draft.enabled) return null

  const seen = new Set<string>()
  let hasPricedTier = false
  let usesSize = false

  for (const row of draft.rows) {
    const size = row.size.trim()
    const quality = row.quality.trim().toLowerCase()
    const rawPrice = row.price.trim()
    if (size === '' && quality === '' && rawPrice === '') continue

    const price = toNumberOrNull(rawPrice)
    if (price === null || price <= 0) {
      return 'Every image tier price must be greater than 0.'
    }
    hasPricedTier = true

    // `2K` and `2048x2048` name the same tier, so duplicates are detected on
    // pixel count rather than on the text the admin typed.
    let sizeKey = ''
    if (size !== '') {
      const pixels = imageSizePixels(size)
      if (pixels === null) {
        return 'Image tier sizes must be written like 2K or 2048x2048.'
      }
      usesSize = true
      sizeKey = String(pixels)
    }

    const condition = `${sizeKey}|${quality}`
    if (seen.has(condition)) {
      return 'Two image tiers use the same size and quality.'
    }
    seen.add(condition)
  }

  if (!hasPricedTier) return null

  // Sizes are matched by nearest pixel count, so a base tier missing from the
  // table would push base-sized requests onto some other tier's price.
  if (usesSize && imageSizePixels(draft.baseSize) === null) {
    return 'Set the base tier size, such as 2K or 1024x1024, before pricing image tiers by size.'
  }

  // Tier prices are stored relative to the model's fixed price, so without one
  // there is nothing to anchor them to and the table cannot be saved at all.
  const anchor = toNumberOrNull(basePrice)
  if (anchor === null || anchor <= 0) {
    return 'Set the fixed price before pricing image tiers.'
  }

  return null
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
  videoPrice: VideoPriceMatrixDraft,
  imagePrice: ImagePriceTiersDraft,
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
    const imageTierCount = imagePrice.enabled
      ? imagePrice.rows.filter((row) => toNumberOrNull(row.price) !== null)
          .length
      : 0
    return [
      {
        key: 'price',
        label: 'ModelPrice',
        value: values.price || t('Empty'),
      },
      {
        key: 'imagePriceTiers',
        label: t('Image tier pricing'),
        value: imageTierCount ? `${imageTierCount} ${t('tiers')}` : t('Empty'),
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
      value: videoPriceTierCount(videoPrice)
        ? `${videoPriceTierCount(videoPrice)} ${t('tiers')}`
        : t('Empty'),
    },
  ]
}

/** Number of priced combinations, used for the preview row. */
function videoPriceTierCount(draft: VideoPriceMatrixDraft): number {
  if (!draft.enabled) return 0
  const columns = videoPriceColumns(draft.axes)
  let count = 0
  for (const row of draft.rows) {
    for (const column of columns) {
      if (toNumberOrNull(row.prices[column.key]) !== null) count += 1
    }
  }
  return count
}
