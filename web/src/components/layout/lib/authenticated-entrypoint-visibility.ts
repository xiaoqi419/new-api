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
import type { NavGroup, NavItem } from '@/components/layout/types'

const HIDDEN_AUTHENTICATED_ENTRY_URLS = new Set([
  '/finance/groupbuy',
  '/user-ranking',
  '/redemption-codes',
  '/subscriptions',
  '/groupbuy/admin',
  '/rebate',
  '/identity-verification/admin',
])

export function isAuthenticatedEntryHidden(url: string): boolean {
  return HIDDEN_AUTHENTICATED_ENTRY_URLS.has(url)
}

function filterNavigationItem(item: NavItem): NavItem | null {
  if ('url' in item && typeof item.url === 'string') {
    return isAuthenticatedEntryHidden(item.url) ? null : item
  }

  if ('items' in item && item.items) {
    const visibleItems = item.items.filter(
      (subItem) => !isAuthenticatedEntryHidden(subItem.url as string)
    )
    return visibleItems.length > 0 ? { ...item, items: visibleItems } : null
  }

  return item
}

export function filterHiddenAuthenticatedEntries(
  navGroups: NavGroup[]
): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map(filterNavigationItem)
        .filter((item): item is NavItem => item !== null),
    }))
    .filter((group) => group.items.length > 0)
}
