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
import { normalizeBannerFill } from '@/lib/banner-fill'

export interface PromoBannerItem {
  text: string
  button_link: string
  button_text: string
  /** A hex color or a `gradient/<id>` preset; see `normalizeBannerFill`. */
  color: string
}

export interface PromoBannerConfig {
  enabled: boolean
  items: PromoBannerItem[]
}

export const EMPTY_PROMO_BANNER_CONFIG: PromoBannerConfig = {
  enabled: false,
  items: [],
}

/**
 * Rendered strip height. Layouts offset their content by this amount, and the
 * console additionally folds it into `--app-header-height`, so it has to be a
 * CSS length rather than the `h-9` utility the banner itself uses.
 */
export const PROMO_BANNER_HEIGHT = '2.25rem'

/** How long each entry stays on screen before the strip slides to the next. */
export const PROMO_BANNER_ROTATE_MS = 5000

function readItem(raw: unknown): PromoBannerItem | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const text = typeof obj.text === 'string' ? obj.text.trim() : ''
  if (!text) return null

  return {
    text,
    button_text:
      typeof obj.button_text === 'string' ? obj.button_text.trim() : '',
    button_link:
      typeof obj.button_link === 'string' ? obj.button_link.trim() : '',
    color: normalizeBannerFill(obj.color),
  }
}

export function parsePromoBannerConfig(raw: unknown): PromoBannerConfig {
  if (!raw) return EMPTY_PROMO_BANNER_CONFIG

  let source: unknown = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return EMPTY_PROMO_BANNER_CONFIG
    try {
      source = JSON.parse(raw)
    } catch {
      return EMPTY_PROMO_BANNER_CONFIG
    }
  }

  if (!source || typeof source !== 'object') return EMPTY_PROMO_BANNER_CONFIG
  const obj = source as Record<string, unknown>

  // A site configured before the strip supported several entries stored the
  // single message on the root object. Read it as one entry so upgrading does
  // not silently blank a live banner.
  const rawItems = Array.isArray(obj.items) ? obj.items : [obj]

  return {
    enabled: obj.enabled === true,
    items: rawItems
      .map(readItem)
      .filter((item): item is PromoBannerItem => item !== null),
  }
}

export function serializePromoBannerConfig(config: PromoBannerConfig): string {
  return JSON.stringify({
    enabled: config.enabled === true,
    items: (config.items ?? [])
      .map((item) => ({
        text: (item.text ?? '').trim(),
        button_text: (item.button_text ?? '').trim(),
        button_link: (item.button_link ?? '').trim(),
        color: normalizeBannerFill(item.color),
      }))
      .filter((item) => item.text),
  })
}
