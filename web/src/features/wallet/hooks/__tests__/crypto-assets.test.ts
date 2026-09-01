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
*/
import { describe, expect, test } from 'vitest'

import { parseCryptoAssets } from '../use-topup-info'

describe('GMPay USDT network parsing', () => {
  test('keeps one known network per response and drops non-USDT tokens', () => {
    const assets = parseCryptoAssets([
      {
        network: 'TRON',
        display_name: 'TRON',
        tokens: ['TRX', 'USDT'],
      },
      {
        network: 'ethereum',
        display_name: 'Ethereum',
        token: 'usdt',
      },
      {
        network: 'ETH',
        display_name: 'Ethereum duplicate',
        tokens: ['USDC', 'USDT'],
      },
      {
        network: 'solana',
        display_name: 'Solana',
        tokens: ['SOL', 'USDC'],
      },
      {
        network: 'unknown-chain',
        display_name: 'Unknown',
        tokens: ['USDT'],
      },
    ])

    expect(assets).toEqual([
      { network: 'tron', token: 'USDT', display_name: 'TRON' },
      { network: 'ethereum', token: 'USDT', display_name: 'Ethereum' },
    ])
  })

  test('accepts a JSON response and returns an empty list for malformed data', () => {
    expect(
      parseCryptoAssets(
        JSON.stringify([{ network: 'bsc', display_name: 'BSC', token: 'USDT' }])
      )
    ).toEqual([{ network: 'binance', token: 'USDT', display_name: 'BSC' }])
    expect(parseCryptoAssets('{"not":"an array"}')).toEqual([])
  })
})
