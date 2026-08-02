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
import { removeCookie } from '@/lib/cookies'
import { THEME_COOKIE_KEYS } from '@/lib/theme-customization'

/**
 * Cookies written by the theme drawer, which was removed in favour of a single
 * curated design. Nothing reads them any more, but they were persisted for a
 * year, so an admin who once flipped the UI to RTL or scaled the type up would
 * stay stuck that way with no control left to undo it.
 */
const ORPHANED_PREFERENCE_COOKIES: readonly string[] = [
  'dir',
  'font',
  'layout_collapsible',
  'layout_variant',
  ...Object.values(THEME_COOKIE_KEYS),
]

export function dropOrphanedPreferenceCookies() {
  for (const name of ORPHANED_PREFERENCE_COOKIES) removeCookie(name)
}
