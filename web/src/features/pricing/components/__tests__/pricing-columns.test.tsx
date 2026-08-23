/*
Copyright (C) 2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { usePricingColumns } from '../pricing-columns'

vi.mock('@/components/data-table', () => ({
  BadgeListCell: () => null,
}))
vi.mock('@/components/group-badge', () => ({
  GroupBadge: () => null,
}))
vi.mock('@/lib/lobe-icon', () => ({
  getLobeIcon: () => null,
}))
vi.mock('../model-billing-mode-badge', () => ({
  ModelBillingModeBadge: () => null,
}))
vi.mock('../../lib/modality', () => ({
  ModalityFlow: () => null,
}))

describe('pricing table columns', () => {
  test('keeps the model column visible while its table scrolls horizontally', () => {
    const { result } = renderHook(() => usePricingColumns())
    const firstColumn = result.current[0] as {
      accessorKey?: string
      id?: string
      meta?: { pinned?: string }
    }

    expect(firstColumn.id ?? firstColumn.accessorKey).toBe('model_name')
    expect(firstColumn.meta).toMatchObject({ pinned: 'left' })
  })
})
