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
import { describe, expect, test } from 'vitest'

import type { SidebarData } from '@/components/layout/types'

import { filterHiddenSidebarEntries } from '../use-sidebar-data'

describe('root navigation visibility', () => {
  test('hides selected entries by stable URL while preserving unmarked entries and order', () => {
    const sidebarData: SidebarData = {
      navGroups: [
        {
          id: 'admin',
          title: 'translated-admin-label',
          items: [
            { title: 'translated-user-ranking', url: '/user-ranking' },
            { title: 'translated-invoice', url: '/invoices/admin' },
            { title: 'translated-redemption', url: '/redemption-codes' },
            { title: 'translated-lottery', url: '/lottery/admin' },
            { title: 'translated-subscription', url: '/subscriptions' },
            { title: 'translated-group-buy', url: '/groupbuy/admin' },
            { title: 'translated-rebate', url: '/rebate' },
            {
              title: 'translated-identity-verification',
              url: '/identity-verification/admin',
            },
            { title: 'translated-acquisition-ranking', url: '/invite-ranking' },
          ],
        },
        {
          id: 'growth',
          title: 'translated-growth-label',
          items: [
            { title: 'translated-group-buy-hall', url: '/finance/groupbuy' },
            { title: 'translated-lottery', url: '/finance/lottery' },
            { title: 'translated-invitation', url: '/account/invitation' },
          ],
        },
      ],
    }

    const filtered = filterHiddenSidebarEntries(sidebarData)

    expect(
      filtered.navGroups.map((group) => group.items.map((item) => item.url))
    ).toEqual([
      ['/invoices/admin', '/lottery/admin', '/invite-ranking'],
      ['/finance/lottery', '/account/invitation'],
    ])
  })
})
