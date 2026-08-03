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
export type SemanticColor =
  | 'blue'
  | 'green'
  | 'cyan'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'light-green'
  | 'teal'
  | 'light-blue'
  | 'indigo'
  | 'violet'
  | 'grey'
  | 'slate'

// Literal palette on purpose: admins pick one of these colors for an API-info
// item and the picker renders the actual swatch. Mapping them onto theme tokens
// would collapse distinct choices (blue and indigo would look identical).
export const colorToBgClass: Record<SemanticColor, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  cyan: 'bg-cyan-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  yellow: 'bg-yellow-500',
  lime: 'bg-lime-500',
  'light-green': 'bg-green-400',
  teal: 'bg-teal-500',
  'light-blue': 'bg-sky-400',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  grey: 'bg-gray-400',
  slate: 'bg-slate-500',
}

/**
 * The colors an admin is offered in a picker. The `light-*` and `grey` members
 * of `SemanticColor` are left out on purpose: they exist so hashed vendor colors
 * spread over more buckets, and next to their base hue they read as duplicates.
 */
export const PICKABLE_COLORS: { value: SemanticColor; label: string }[] = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'purple', label: 'Purple' },
  { value: 'pink', label: 'Pink' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'amber', label: 'Amber' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'lime', label: 'Lime' },
  { value: 'teal', label: 'Teal' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'violet', label: 'Violet' },
  { value: 'slate', label: 'Slate' },
]

/**
 * Solid fills for a full-width strip that always carries white text. The weight
 * differs per hue because white needs 4.5:1 to pass AA: the cool hues reach it
 * at 600 while the warm ones only do at 700. Measured against the Tailwind
 * palette the weakest pair here is pink-600 at 4.54, so a single shared weight
 * would have shipped unreadable yellow and lime strips.
 */
export const bannerColorMap: Record<SemanticColor, string> = {
  blue: 'bg-blue-600',
  green: 'bg-green-700',
  cyan: 'bg-cyan-700',
  purple: 'bg-purple-600',
  pink: 'bg-pink-600',
  red: 'bg-red-600',
  orange: 'bg-orange-700',
  amber: 'bg-amber-700',
  yellow: 'bg-yellow-700',
  lime: 'bg-lime-700',
  'light-green': 'bg-green-700',
  teal: 'bg-teal-700',
  'light-blue': 'bg-blue-600',
  indigo: 'bg-indigo-600',
  violet: 'bg-violet-600',
  grey: 'bg-slate-600',
  slate: 'bg-slate-600',
}

export function getBannerColorClass(color?: string): string {
  if (!color) return bannerColorMap.blue
  return (
    (bannerColorMap as Record<string, string>)[color] || bannerColorMap.blue
  )
}

export const avatarColorMap: Record<SemanticColor, string> = {
  blue: 'bg-chart-1/10 text-tag-1',
  green: 'bg-success/10 text-success',
  cyan: 'bg-chart-2/10 text-tag-2',
  purple: 'bg-chart-4/10 text-tag-4',
  pink: 'bg-chart-5/10 text-tag-5',
  red: 'bg-destructive/10 text-destructive',
  orange: 'bg-warning/10 text-warning',
  amber: 'bg-warning/10 text-warning',
  yellow: 'bg-warning/10 text-warning',
  lime: 'bg-chart-3/10 text-tag-3',
  'light-green': 'bg-success/10 text-success',
  teal: 'bg-chart-2/10 text-tag-2',
  'light-blue': 'bg-chart-2/10 text-tag-2',
  indigo: 'bg-chart-1/10 text-tag-1',
  violet: 'bg-chart-4/10 text-tag-4',
  grey: 'bg-muted text-muted-foreground',
  slate: 'bg-muted text-muted-foreground',
}

export function getAvatarColorClass(name: string): string {
  return avatarColorMap[stringToColor(name)]
}

export function getBgColorClass(color?: string): string {
  if (!color) return colorToBgClass.blue
  return (
    (colorToBgClass as Record<string, string>)[color] || colorToBgClass.blue
  )
}

/**
 * Announcement status types
 */
export type AnnouncementType =
  | 'default'
  | 'ongoing'
  | 'success'
  | 'warning'
  | 'error'

/**
 * Announcement status color mapping
 */
export const ANNOUNCEMENT_TYPE_COLORS: Record<AnnouncementType, string> = {
  default: 'bg-neutral',
  ongoing: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
}

/**
 * Get announcement status color class
 */
export function getAnnouncementColorClass(type?: string): string {
  const validType = (type || 'default') as AnnouncementType
  return ANNOUNCEMENT_TYPE_COLORS[validType] || ANNOUNCEMENT_TYPE_COLORS.default
}

/**
 * Color a group ratio so the multiplier can be read without parsing the number:
 * below 1 is cheaper than base price, above 1 is a surcharge.
 *
 * Shared by the group badge, the pricing group view, the pricing sidebar filter
 * and the model detail group cards, so one screen cannot show two color schemes
 * for the same multiplier.
 */
export function getGroupRatioClassName(ratio: number): string {
  if (ratio > 1) {
    return 'bg-warning/10 text-warning'
  }
  if (ratio < 1) {
    return 'bg-success/10 text-success'
  }
  return 'bg-muted text-muted-foreground'
}

/**
 * Recognizable hues for the vendors this gateway commonly proxies.
 *
 * Matched as substrings against the vendor's lobe icon key and its name, in the
 * order below, so a pasted icon value still resolves (one production row holds
 * a whole `import { Volcengine } ...` statement) and a renamed vendor keeps its
 * brand color as long as the icon survives. Vendors outside this list fall back
 * to the name hash, which still gives every vendor on screen a distinct hue.
 *
 * Values are limited to `TAG_COLORS` so the result is also a valid badge
 * variant, and every hue resolves through the existing theme tokens rather than
 * a second palette that would ignore dark mode and the active accent.
 */
const VENDOR_BRAND_COLORS: [string, TagColor][] = [
  ['openai', 'green'],
  ['anthropic', 'orange'],
  ['claude', 'orange'],
  ['gemini', 'blue'],
  ['google', 'blue'],
  ['deepseek', 'cyan'],
  ['qwen', 'purple'],
  ['tongyi', 'purple'],
  ['zhipu', 'lime'],
  ['glm', 'lime'],
  ['moonshot', 'grey'],
  ['kimi', 'grey'],
  ['minimax', 'red'],
  ['volcengine', 'pink'],
  ['bytedance', 'pink'],
  ['doubao', 'pink'],
  ['spark', 'indigo'],
  ['xunfei', 'indigo'],
]

export function getVendorColor(vendor: {
  name?: string
  icon?: string
}): TagColor {
  const haystack = `${vendor.icon ?? ''} ${vendor.name ?? ''}`.toLowerCase()
  for (const [token, color] of VENDOR_BRAND_COLORS) {
    if (haystack.includes(token)) return color
  }
  return stringToColor(vendor.name || vendor.icon || '')
}

/**
 * Semantic colors for tags and badges
 */
const TAG_COLORS = [
  'amber',
  'blue',
  'cyan',
  'green',
  'grey',
  'indigo',
  'light-blue',
  'lime',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'violet',
  'yellow',
] as const

/**
 * The subset of `SemanticColor` that automatic assignment can produce. Narrower
 * than `SemanticColor` on purpose: every value here is also a valid badge
 * variant, while `SemanticColor` additionally carries picker-only entries the
 * badge component has no styles for.
 */
export type TagColor = (typeof TAG_COLORS)[number]

/**
 * Convert string to a stable semantic color
 * Used for model tags, group badges, user avatars, etc.
 * Same string always returns the same color
 *
 * @param str - Input string (model name, group name, username, etc.)
 * @returns Semantic color name from TAG_COLORS
 *
 * @example
 * stringToColor('gpt-4') // 'blue'
 * stringToColor('claude-3') // 'purple'
 * stringToColor('default') // 'green'
 */
export function stringToColor(str: string): TagColor {
  let sum = 0
  for (let i = 0; i < str.length; i++) {
    sum += str.charCodeAt(i)
  }
  const index = sum % TAG_COLORS.length
  return TAG_COLORS[index]
}
