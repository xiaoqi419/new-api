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

export interface PromoBannerConfig {
  enabled: boolean
  text: string
  button_text: string
  button_link: string
}

export const EMPTY_PROMO_BANNER_CONFIG: PromoBannerConfig = {
  enabled: false,
  text: '',
  button_text: '',
  button_link: '',
}

/**
 * Rendered strip height. Layouts offset their content by this amount, and the
 * console additionally folds it into `--app-header-height`, so it has to be a
 * CSS length rather than the `h-9` utility the banner itself uses.
 */
export const PROMO_BANNER_HEIGHT = '2.25rem'

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

  return {
    enabled: obj.enabled === true,
    text: typeof obj.text === 'string' ? obj.text.trim() : '',
    button_text:
      typeof obj.button_text === 'string' ? obj.button_text.trim() : '',
    button_link:
      typeof obj.button_link === 'string' ? obj.button_link.trim() : '',
  }
}

export function serializePromoBannerConfig(config: PromoBannerConfig): string {
  return JSON.stringify({
    enabled: config.enabled === true,
    text: (config.text ?? '').trim(),
    button_text: (config.button_text ?? '').trim(),
    button_link: (config.button_link ?? '').trim(),
  })
}
