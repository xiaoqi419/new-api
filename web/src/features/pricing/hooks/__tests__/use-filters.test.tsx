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
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, test, vi } from 'vitest'

import type { PricingModel } from '../../types'
import { useFilters } from '../use-filters'

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({ modality: 'image' }),
}))

const models: PricingModel[] = [
  {
    id: 1,
    model_name: 'image-model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    output_modalities: ['image'],
  },
  {
    id: 2,
    model_name: 'text-model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    output_modalities: ['text'],
  },
]

describe('useFilters', () => {
  test('counts a URL modality filter as active and limits visible models', () => {
    const { result } = renderHook(() => useFilters(models))

    expect(result.current.hasActiveFilters).toBe(true)
    expect(result.current.activeFilterCount).toBe(1)
    expect(
      result.current.filteredModels.map((model) => model.model_name)
    ).toEqual(['image-model'])

    act(() => {
      result.current.clearFilters()
    })

    expect(result.current.hasActiveFilters).toBe(false)
    expect(result.current.activeFilterCount).toBe(0)
    expect(
      result.current.filteredModels.map((model) => model.model_name)
    ).toEqual(['image-model', 'text-model'])
  })
})
