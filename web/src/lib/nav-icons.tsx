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
import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function isLucideIcon(candidate: unknown): candidate is LucideIcon {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    '$$typeof' in candidate &&
    candidate.$$typeof === Symbol.for('react.forward_ref')
  )
}

/**
 * All selectable Lucide icon names used to populate the header-navigation
 * icon picker.
 */
export const NAV_ICON_NAMES: string[] = Object.keys(Icons)
  .filter(
    (name) =>
      /^[A-Z]/.test(name) &&
      isLucideIcon((Icons as Record<string, unknown>)[name])
  )
  .sort((a, b) => a.localeCompare(b))

/**
 * Resolve an icon name to its component. Returns null for empty/unknown names
 * so callers can render nothing when an item has no icon.
 */
export function resolveNavIcon(name?: string | null): LucideIcon | null {
  if (!name) return null
  const candidate = (Icons as Record<string, unknown>)[name]
  return isLucideIcon(candidate) ? candidate : null
}

/**
 * Header navigation item keys that support a configurable icon. Kept in sync
 * with the modules rendered by `useTopNavLinks` plus the standalone community
 * entry.
 */
export const NAV_ICON_KEYS = [
  'home',
  'console',
  'pricing',
  'rankings',
  'docs',
  'externalDocs',
  'about',
  'community',
] as const

export type NavIconKey = (typeof NAV_ICON_KEYS)[number]

/**
 * Default icon per navigation item, applied as a fallback when the admin has
 * not saved an explicit choice for that item.
 */
export const DEFAULT_NAV_ICONS: Record<NavIconKey, string> = {
  home: 'Home',
  console: 'Gauge',
  pricing: 'Boxes',
  rankings: 'Trophy',
  docs: 'FileText',
  externalDocs: 'BookOpen',
  about: 'Info',
  community: 'Users',
}

/**
 * Effective icon name for a navigation item given the saved icons map.
 * - key present with a value -> that value
 * - key present but empty string -> undefined (explicitly no icon)
 * - key absent -> the built-in default
 */
export function navIconNameFor(
  icons: Record<string, string> | undefined,
  key: NavIconKey
): string | undefined {
  if (icons && key in icons) {
    return icons[key] || undefined
  }
  return DEFAULT_NAV_ICONS[key]
}

export function navIconFor(
  icons: Record<string, string> | undefined,
  key: NavIconKey
): LucideIcon | null {
  return resolveNavIcon(navIconNameFor(icons, key))
}
