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

import { getAlipayQrOrder } from './use-alipay-payment'

describe('Alipay face-to-face order payload', () => {
  test('accepts a QR image with its trade number', () => {
    assert.deepEqual(
      getAlipayQrOrder({
        qr_code: 'data:image/png;base64,iVBORw0KGgo=',
        trade_no: 'USR1NOabcd1700000000',
      }),
      {
        qrCode: 'data:image/png;base64,iVBORw0KGgo=',
        tradeNo: 'USR1NOabcd1700000000',
      }
    )
  })

  test('rejects a blank QR so a rejected pre-create never opens an empty dialog', () => {
    assert.equal(getAlipayQrOrder({ qr_code: '', trade_no: 'T1' }), null)
    assert.equal(getAlipayQrOrder({ trade_no: 'T1' }), null)
  })

  test('rejects the string error payload the backend returns on failure', () => {
    assert.equal(getAlipayQrOrder('管理员未开启支付宝'), null)
    assert.equal(getAlipayQrOrder(null), null)
  })

  test('still opens the dialog when the trade number is missing', () => {
    assert.deepEqual(getAlipayQrOrder({ qr_code: 'data:image/png;base64,x' }), {
      qrCode: 'data:image/png;base64,x',
      tradeNo: '',
    })
  })
})
