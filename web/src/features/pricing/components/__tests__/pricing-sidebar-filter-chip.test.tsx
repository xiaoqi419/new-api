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
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, test } from 'vitest'

import { FILTER_ALL } from '../../constants'
import type { PricingModel } from '../../types'
import { PricingSidebar } from '../pricing-sidebar'

const models: PricingModel[] = [
  {
    id: 1,
    model_name: 'gpt-5.6-terra',
    vendor_name: 'OpenAI',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['Codex-Pro'],
    tags: 'reasoning',
    supported_endpoint_types: ['openai-response'],
  },
]

function PricingSidebarHarness() {
  const [groupFilter, setGroupFilter] = useState(FILTER_ALL)

  return (
    <PricingSidebar
      quotaTypeFilter={FILTER_ALL}
      endpointTypeFilter={FILTER_ALL}
      vendorFilter={FILTER_ALL}
      groupFilter={groupFilter}
      tagFilter={FILTER_ALL}
      modalityFilter={FILTER_ALL}
      onQuotaTypeChange={() => undefined}
      onEndpointTypeChange={() => undefined}
      onVendorChange={() => undefined}
      onGroupChange={setGroupFilter}
      onTagChange={() => undefined}
      onModalityChange={() => undefined}
      vendors={[{ id: 1, name: 'OpenAI' }]}
      groups={['Codex-Pro']}
      groupRatios={{ 'Codex-Pro': 0.26 }}
      tags={['reasoning']}
      models={models}
      hasActiveFilters={groupFilter !== FILTER_ALL}
      onClearFilters={() => setGroupFilter(FILTER_ALL)}
    />
  )
}

describe('PricingSidebar filter chips', () => {
  test('keeps selected and unselected states legible in light and dark themes', () => {
    render(<PricingSidebarHarness />)

    const selected = screen.getByRole('button', { name: 'All Groups' })
    const unselected = screen.getByTitle('Codex-Pro')

    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(selected).toHaveClass(
      'border-[#2f00e5]',
      'bg-[#2f00e5]',
      'text-white',
      'dark:border-[#d4ff1f]',
      'dark:bg-[#d4ff1f]',
      'dark:text-[#111]'
    )
    expect(unselected).toHaveAttribute('aria-pressed', 'false')
    expect(unselected).toHaveClass(
      'border-[#b8c0ca]',
      'bg-[#f4f6f8]',
      'text-[#252a31]',
      'dark:border-white/18',
      'dark:bg-white/8',
      'dark:text-[#d7d7d7]'
    )
  })

  test('updates the pressed state and gives the active ratio a high-contrast badge', () => {
    render(<PricingSidebarHarness />)

    fireEvent.click(screen.getByTitle('Codex-Pro'))

    const selected = screen.getByTitle('Codex-Pro')
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(within(selected).getByText('x0.26')).toHaveClass(
      'bg-white/18',
      'text-white',
      'dark:bg-[#111]/12',
      'dark:text-[#111]'
    )
  })
})
