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
 * Personal center page section definitions
 */
const ACCOUNT_SECTIONS = [
  {
    id: 'profile',
    titleKey: 'Profile',
    build: () => null, // Content is rendered directly in the page component
  },
  {
    id: 'invitation',
    titleKey: 'Invitation',
    build: () => null, // Content is rendered directly in the page component
  },
  {
    id: 'identity-verification',
    titleKey: 'Identity Verification',
    build: () => null, // Content is rendered directly in the page component
  },
] as const

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]['id']

const accountRegistry = createSectionRegistry<
  AccountSectionId,
  Record<string, never>,
  []
>({
  sections: ACCOUNT_SECTIONS,
  defaultSection: 'profile',
  basePath: '/account',
  urlStyle: 'path',
})

export const ACCOUNT_SECTION_IDS = accountRegistry.sectionIds
export const ACCOUNT_DEFAULT_SECTION = accountRegistry.defaultSection

/** Type guard for validating section IDs without casting. */
export function isAccountSectionId(s: string): s is AccountSectionId {
  return (ACCOUNT_SECTION_IDS as readonly string[]).includes(s)
}
