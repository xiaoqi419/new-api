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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { CryptoAsset } from '../../../types'
import { CryptoAssetSelectDialog } from '../crypto-asset-select-dialog'

const assets: CryptoAsset[] = [
  { network: 'tron', token: 'USDT', display_name: 'TRON' },
  { network: 'solana', token: 'USDC', display_name: 'Solana' },
]

describe('crypto asset selection dialog', () => {
  test('shows every configured asset and returns the selected pair', async () => {
    const onSelect = vi.fn()
    render(
      <CryptoAssetSelectDialog
        open
        assets={assets}
        onOpenChange={() => undefined}
        onSelect={onSelect}
      />
    )

    expect(screen.getByText('TRON')).toBeVisible()
    expect(screen.getByText('Solana')).toBeVisible()

    fireEvent.click(screen.getByRole('option', { name: /Solana/ }))
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(assets[1])
    })
  })

  test('does not render when no wallet assets are configured', () => {
    const { container } = render(
      <CryptoAssetSelectDialog
        open
        assets={[]}
        onOpenChange={() => undefined}
        onSelect={() => undefined}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
