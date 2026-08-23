import type { TFunction } from 'i18next'
import {
  Box,
  CreditCard,
  Layout,
  Settings,
  Shield,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
/*
Copyright (C) 2026 QuantumNous

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
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/features/system-settings/auth/section-registry.tsx', () => ({
  getAuthSectionNavItems: () => [],
}))
vi.mock('@/features/system-settings/billing/section-registry.tsx', () => ({
  getBillingSectionNavItems: () => [],
}))
vi.mock('@/features/system-settings/content/section-registry.tsx', () => ({
  getContentSectionNavItems: () => [],
}))
vi.mock('@/features/system-settings/models/section-registry.tsx', () => ({
  getModelsSectionNavItems: () => [],
}))
vi.mock('@/features/system-settings/operations/section-registry.tsx', () => ({
  getOperationsSectionNavItems: () => [],
}))
vi.mock('@/features/system-settings/security/section-registry.tsx', () => ({
  getSecuritySectionNavItems: () => [],
}))
vi.mock('@/features/system-settings/site/section-registry.tsx', () => ({
  getSiteSectionNavItems: () => [],
}))

const { SYSTEM_SETTINGS_VIEW } = await import('../system-settings.config')

const translate = ((key: string) => key) as TFunction

describe('system settings sidebar navigation', () => {
  test('uses Lucide icons for every nested navigation category', () => {
    const groups = SYSTEM_SETTINGS_VIEW.getNavGroups(translate)
    const icons = groups.flatMap((group) =>
      group.items.map((item) => item.icon)
    )

    expect(icons).toEqual([
      Settings,
      Shield,
      CreditCard,
      Box,
      ShieldAlert,
      Layout,
      Wrench,
    ])
  })
})
