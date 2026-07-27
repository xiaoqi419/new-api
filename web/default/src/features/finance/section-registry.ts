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
import { createSectionRegistry } from '@/features/system-settings/utils/section-registry'

/**
 * Finance center page section definitions
 */
const FINANCE_SECTIONS = [
  {
    id: 'wallet',
    titleKey: 'Wallet',
    build: () => null, // Content is rendered directly in the page component
  },
  {
    id: 'groupbuy',
    titleKey: 'Group Buy Hall',
    build: () => null, // Content is rendered directly in the page component
  },
  {
    id: 'invoices',
    titleKey: 'Invoices',
    build: () => null, // Content is rendered directly in the page component
  },
  {
    id: 'lottery',
    titleKey: 'Lucky Draw',
    build: () => null, // Content is rendered directly in the page component
  },
] as const

export type FinanceSectionId = (typeof FINANCE_SECTIONS)[number]['id']

const financeRegistry = createSectionRegistry<
  FinanceSectionId,
  Record<string, never>,
  []
>({
  sections: FINANCE_SECTIONS,
  defaultSection: 'wallet',
  basePath: '/finance',
  urlStyle: 'path',
})

export const FINANCE_SECTION_IDS = financeRegistry.sectionIds
export const FINANCE_DEFAULT_SECTION = financeRegistry.defaultSection

/** Type guard for validating section IDs without casting. */
export function isFinanceSectionId(s: string): s is FinanceSectionId {
  return (FINANCE_SECTION_IDS as readonly string[]).includes(s)
}
