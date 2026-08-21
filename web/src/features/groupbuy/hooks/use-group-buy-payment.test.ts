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
import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { resolveCheckoutClose } from './use-group-buy-payment'

describe('Group buy checkout close', () => {
  test('abandoning checkout releases the seat and never navigates into the group', () => {
    assert.deepEqual(
      resolveCheckoutClose({
        paid: false,
        tradeNo: 'GBU1NOabcd1700000000',
        groupNo: 'GB123',
        redirectAfterPay: true,
      }),
      { releaseTradeNo: 'GBU1NOabcd1700000000', navigateToGroup: null }
    )
  })

  test('paying navigates into the group when the launcher asked for it', () => {
    assert.deepEqual(
      resolveCheckoutClose({
        paid: true,
        tradeNo: 'GBU1NOabcd1700000000',
        groupNo: 'GB123',
        redirectAfterPay: true,
      }),
      { releaseTradeNo: null, navigateToGroup: 'GB123' }
    )
  })

  test('paying on the detail page stays put and releases nothing', () => {
    assert.deepEqual(
      resolveCheckoutClose({
        paid: true,
        tradeNo: 'GBU1NOabcd1700000000',
        groupNo: 'GB123',
      }),
      { releaseTradeNo: null, navigateToGroup: null }
    )
  })

  test('a close with no trade number has nothing to release', () => {
    assert.deepEqual(
      resolveCheckoutClose({ paid: false, tradeNo: '', groupNo: 'GB123' }),
      { releaseTradeNo: null, navigateToGroup: null }
    )
  })
})
