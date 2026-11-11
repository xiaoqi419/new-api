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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { TopUpBonusSettings } from './topup-bonus-settings'

const mocks = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('@/features/system-settings/api', () => ({
  updateSystemOption: mocks.save,
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ auth: { user: { role: 100 } } }),
}))
vi.mock('@/features/system-settings/hooks/use-system-options', () => ({
  useSystemOptions: () => ({ data: { data: [] }, isLoading: false }),
  getOptionValue: () => ({
    TopUpBonusCampaign: JSON.stringify({
      enabled: true,
      start: 1794326400,
      end: 1794412800,
      tiers: [{ pay: 100, gift: 10 }],
    }),
  }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('campaign settings', () => {
  test('switches legacy gift to threshold discount and saves numeric rate', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TopUpBonusSettings />
      </QueryClientProvider>
    )
    expect(screen.getByLabelText('Gift amount (CNY)')).toHaveValue('10')
    await userEvent.click(
      screen.getByRole('combobox', { name: 'Campaign mode' })
    )
    await userEvent.click(
      await screen.findByRole('option', { name: 'Discount mode' })
    )
    fireEvent.change(screen.getByLabelText('Discount (9 means pay 90%)'), {
      target: { value: '9' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save recharge bonus' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    const payload = JSON.parse(mocks.save.mock.calls[0][0].value)
    expect(payload.mode).toBe('discount')
    expect(payload.tiers).toEqual([{ pay: 100, discount: 0.9 }])
  })
})
