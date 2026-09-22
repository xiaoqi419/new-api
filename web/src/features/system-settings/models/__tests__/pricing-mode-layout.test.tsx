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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ModelPricingEditorPanel } from '../model-pricing-sheet'

const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
})

it('wraps long pricing mode labels within equal columns and keeps modes selectable on narrow screens', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: [], vendors: [] },
  })
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { effective: {} } },
  })
  render(
    <QueryClientProvider client={client}>
      <div style={{ width: 342 }}>
        <ModelPricingEditorPanel
          embedded
          editData={{
            name: 'test-model',
            billingMode: 'per-token',
            ratio: '1',
          }}
        />
      </div>
    </QueryClientProvider>
  )
  const tokenTab = screen.getByRole('tab', { name: 'Per-token (deprecated)' })
  const list = tokenTab.closest('[role="tablist"]') as HTMLElement
  expect(list).toHaveClass('grid-cols-3', 'group-data-horizontal/tabs:h-auto')
  for (const tab of within(list).getAllByRole('tab')) {
    expect(tab).toHaveClass(
      'min-w-0',
      'min-h-11',
      'h-auto',
      'whitespace-normal',
      'wrap-anywhere'
    )
  }
  expect(tokenTab).toHaveAttribute('aria-selected', 'true')
  const requestTab = screen.getByRole('tab', {
    name: 'Per-request (deprecated)',
  })
  await userEvent.setup().click(requestTab)
  expect(requestTab).toHaveAttribute('aria-selected', 'true')
})
