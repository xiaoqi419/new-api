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
  { network: 'ethereum', token: 'USDT', display_name: 'Ethereum' },
]

const multiCurrencyAssets: CryptoAsset[] = [
  { network: 'tron', token: 'USDT', display_name: 'TRON' },
  { network: 'tron', token: 'USDC', display_name: 'TRON' },
  { network: 'ethereum', token: 'USDC', display_name: 'Ethereum' },
]

describe('crypto asset selection dialog', () => {
  test('shows only configured USDT networks and returns the selected pair', async () => {
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
    expect(screen.getByText('Ethereum')).toBeVisible()
    expect(screen.getByText('USDT · TRC20')).toBeVisible()
    expect(screen.getByText('USDT · ERC20')).toBeVisible()

    fireEvent.click(screen.getByRole('option', { name: /Ethereum/ }))
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

  test('shows the currency stage when multiple stablecoins are available', () => {
    render(
      <CryptoAssetSelectDialog
        open
        assets={multiCurrencyAssets}
        onOpenChange={() => undefined}
        onSelect={() => undefined}
      />
    )

    expect(
      screen.getByRole('listbox', { name: 'Payment currency' })
    ).toBeVisible()
    expect(screen.getByRole('option', { name: /USDT/ })).toBeVisible()
    expect(screen.getByRole('option', { name: /USDC/ })).toBeVisible()
    expect(screen.queryByText('TRC20')).not.toBeInTheDocument()
  })

  test('does not create an order before the final network selection for one currency', async () => {
    const onSelect = vi.fn()
    const singleCurrencyAsset = [multiCurrencyAssets[0]]

    render(
      <CryptoAssetSelectDialog
        open
        assets={singleCurrencyAsset}
        onOpenChange={() => undefined}
        onSelect={onSelect}
      />
    )

    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('option', { name: /TRON.*USDT/ }))
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(singleCurrencyAsset[0])
    })
  })

  test('skips a single network after choosing its currency', async () => {
    const onSelect = vi.fn()

    render(
      <CryptoAssetSelectDialog
        open
        assets={multiCurrencyAssets}
        onOpenChange={() => undefined}
        onSelect={onSelect}
      />
    )

    fireEvent.click(screen.getByRole('option', { name: /USDT/ }))
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(multiCurrencyAssets[0])
    })
  })

  test('returns to the currency stage without selecting an asset', () => {
    const onSelect = vi.fn()

    render(
      <CryptoAssetSelectDialog
        open
        assets={multiCurrencyAssets}
        onOpenChange={() => undefined}
        onSelect={onSelect}
      />
    )

    fireEvent.click(screen.getByRole('option', { name: /USDC/ }))
    expect(
      screen.getByRole('listbox', { name: 'Payment network' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(
      screen.getByRole('listbox', { name: 'Payment currency' })
    ).toBeVisible()
    expect(onSelect).not.toHaveBeenCalled()
  })

  test('cancelling the selector never invokes asset selection', () => {
    const onSelect = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <CryptoAssetSelectDialog
        open
        assets={multiCurrencyAssets}
        onOpenChange={onOpenChange}
        onSelect={onSelect}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSelect).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
