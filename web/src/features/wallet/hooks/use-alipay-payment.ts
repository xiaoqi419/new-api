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
import i18next from 'i18next'
import { useState, useCallback } from 'react'
import { toast } from 'sonner'

import { requestAlipayPayment, isApiSuccess } from '../api'
import { PAYMENT_TYPES } from '../constants'

interface AlipayQrOrder {
  qrCode: string
  tradeNo: string
}

export function getAlipayQrOrder(data: unknown): AlipayQrOrder | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  if (!('qr_code' in data) || typeof data.qr_code !== 'string') {
    return null
  }
  if (!data.qr_code) {
    return null
  }
  const tradeNo =
    'trade_no' in data && typeof data.trade_no === 'string' ? data.trade_no : ''
  return { qrCode: data.qr_code, tradeNo }
}

/**
 * Hook for the direct Alipay merchant flow (POST /api/user/alipay/pay).
 *
 * The backend places a face-to-face (alipay.trade.precreate) order and answers
 * with a QR image, so this cannot reuse the generic epay processor and there is
 * no checkout page to redirect to.
 */
export function useAlipayPayment() {
  const [processing, setProcessing] = useState(false)
  const [qrOrder, setQrOrder] = useState<AlipayQrOrder | null>(null)

  const processAlipayPayment = useCallback(async (topupAmount: number) => {
    setProcessing(true)

    try {
      const response = await requestAlipayPayment({
        amount: Math.floor(topupAmount),
        payment_method: PAYMENT_TYPES.ALIPAY_DIRECT,
      })

      if (isApiSuccess(response)) {
        const order = getAlipayQrOrder(response.data)
        if (order) {
          setQrOrder(order)
          return true
        }
      }

      const detail = response.data
      toast.error(
        typeof detail === 'string' && detail.trim()
          ? detail
          : response.message || i18next.t('Payment request failed')
      )
      return false
    } catch {
      toast.error(i18next.t('Payment request failed'))
      return false
    } finally {
      setProcessing(false)
    }
  }, [])

  const closeAlipayQr = useCallback(() => setQrOrder(null), [])

  return { processing, processAlipayPayment, qrOrder, closeAlipayQr }
}
