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

/**
 * Banner fills are stored as a literal color rather than a theme token: the
 * picker lets an operator choose any color, so there is no token to point at.
 * The preset swatches below are the Tailwind values the rest of the console
 * uses, at the shade that keeps white text above WCAG AA on that hue.
 */

export type BannerPreset = { value: string; label: string }

export const BANNER_PRESET_COLORS: BannerPreset[] = [
  { value: '#155dfc', label: 'Blue' },
  { value: '#4f39f6', label: 'Indigo' },
  { value: '#7f22fe', label: 'Violet' },
  { value: '#9810fa', label: 'Purple' },
  { value: '#e60076', label: 'Pink' },
  { value: '#e7000b', label: 'Red' },
  { value: '#ca3500', label: 'Orange' },
  { value: '#bb4d00', label: 'Amber' },
  { value: '#a65f00', label: 'Yellow' },
  { value: '#497d00', label: 'Lime' },
  { value: '#008236', label: 'Green' },
  { value: '#00786f', label: 'Teal' },
  { value: '#007595', label: 'Cyan' },
  { value: '#45556c', label: 'Slate' },
]

export const GRADIENT_PREFIX = 'gradient/'

export type BannerGradient = {
  id: string
  label: string
  from: string
  to: string
}

export const BANNER_GRADIENTS: BannerGradient[] = [
  { id: 'sunset', label: 'Sunset', from: '#e7000b', to: '#bb4d00' },
  { id: 'aurora', label: 'Aurora', from: '#007595', to: '#7f22fe' },
  { id: 'ocean', label: 'Ocean', from: '#155dfc', to: '#007595' },
  { id: 'forest', label: 'Forest', from: '#008236', to: '#00786f' },
  { id: 'dusk', label: 'Dusk', from: '#7f22fe', to: '#e60076' },
  { id: 'nebula', label: 'Nebula', from: '#4f39f6', to: '#9810fa' },
  { id: 'citrus', label: 'Citrus', from: '#497d00', to: '#00786f' },
  { id: 'midnight', label: 'Midnight', from: '#45556c', to: '#1d293d' },
]

export const DEFAULT_BANNER_FILL = BANNER_PRESET_COLORS[0].value

/** Contrast ratio at or above which WCAG AA passes for normal-size text. */
export const MIN_TEXT_CONTRAST = 4.5

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value.trim())
}

/** Expands `#abc` to `#aabbcc` and lowercases, so stored values compare cleanly. */
export function normalizeHex(value: string): string {
  const hex = value.trim().toLowerCase()
  if (hex.length !== 4) return hex
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
}

function channelToLinear(channel: number): number {
  const ratio = channel / 255
  return ratio <= 0.04045
    ? ratio / 12.92
    : Math.pow((ratio + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hex: string): number {
  const normalized = normalizeHex(hex)
  const red = Number.parseInt(normalized.slice(1, 3), 16)
  const green = Number.parseInt(normalized.slice(3, 5), 16)
  const blue = Number.parseInt(normalized.slice(5, 7), 16)
  return (
    0.2126 * channelToLinear(red) +
    0.7152 * channelToLinear(green) +
    0.0722 * channelToLinear(blue)
  )
}

export function contrastRatio(hex: string, against: string): number {
  const a = relativeLuminance(hex)
  const b = relativeLuminance(against)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const WHITE = '#ffffff'
const NEAR_BLACK = '#1d293d'

function mixHex(from: string, to: string, ratio: number): string {
  const a = normalizeHex(from)
  const b = normalizeHex(to)
  const channel = (offset: number) => {
    const start = Number.parseInt(a.slice(offset, offset + 2), 16)
    const end = Number.parseInt(b.slice(offset, offset + 2), 16)
    return Math.round(start + (end - start) * ratio)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(1)}${channel(3)}${channel(5)}`
}

/**
 * Worst contrast a text color faces anywhere on a fill. A gradient has to be
 * sampled rather than checked at its two stops: luminance weights green far
 * above red, so a ramp where red falls while green rises passes through
 * luminances outside the range its endpoints span. Measured on the presets
 * here, the midpoint of `sunset` is worse against white than either stop.
 */
export function worstContrast(fill: string, textColor: string): number {
  const gradient = findBannerGradient(fill)
  if (!gradient) return contrastRatio(normalizeHex(fill), textColor)

  const samples = 21
  let worst = Number.POSITIVE_INFINITY
  for (let step = 0; step < samples; step++) {
    const stop = mixHex(gradient.from, gradient.to, step / (samples - 1))
    worst = Math.min(worst, contrastRatio(stop, textColor))
  }
  return worst
}

export function findBannerGradient(fill: string): BannerGradient | undefined {
  if (!fill.startsWith(GRADIENT_PREFIX)) return undefined
  const id = fill.slice(GRADIENT_PREFIX.length)
  return BANNER_GRADIENTS.find((gradient) => gradient.id === id)
}

const LEGACY_COLOR_NAMES: Record<string, string> = Object.fromEntries(
  BANNER_PRESET_COLORS.map((preset) => [
    preset.label.toLowerCase(),
    preset.value,
  ])
)

/**
 * Accepts what any shipped version could have stored: a hex color, a gradient
 * id, or one of the named theme colors the first color picker offered.
 */
export function normalizeBannerFill(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_BANNER_FILL
  const value = raw.trim()
  if (!value) return DEFAULT_BANNER_FILL

  if (findBannerGradient(value)) return value
  if (isHexColor(value)) return normalizeHex(value)

  const legacy = LEGACY_COLOR_NAMES[value.toLowerCase()]
  return legacy ?? DEFAULT_BANNER_FILL
}

export type ResolvedBannerFill = {
  /** Ready for a `background` style, whether flat or a gradient. */
  background: string
  /** Text and control tints have to flip on a light fill. */
  onLight: boolean
  contrast: number
}

export function resolveBannerFill(raw: unknown): ResolvedBannerFill {
  const fill = normalizeBannerFill(raw)
  const gradient = findBannerGradient(fill)

  const onWhite = worstContrast(fill, WHITE)
  const onBlack = worstContrast(fill, NEAR_BLACK)
  const onLight = onBlack > onWhite

  return {
    background: gradient
      ? `linear-gradient(90deg, ${gradient.from} 0%, ${gradient.to} 100%)`
      : fill,
    onLight,
    contrast: Math.max(onWhite, onBlack),
  }
}
