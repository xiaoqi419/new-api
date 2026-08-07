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
import { isSafePaymentRedirectUrl } from '../lib'

export function getAlipayPayUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  if ('pay_url' in data && typeof data.pay_url === 'string') {
    return data.pay_url
  }
  return null
}

/**
 * Hook for the direct Alipay merchant flow (POST /api/user/alipay/pay).
 *
 * The backend answers with a signed alipay.com page-pay URL instead of the
 * epay form params used by PAYMENT_TYPES.ALIPAY, so this cannot reuse the
 * generic payment processor.
 */
export function useAlipayPayment() {
  const [processing, setProcessing] = useState(false)

  const processAlipayPayment = useCallback(async (topupAmount: number) => {
    setProcessing(true)

    try {
      const response = await requestAlipayPayment({
        amount: Math.floor(topupAmount),
        payment_method: PAYMENT_TYPES.ALIPAY_DIRECT,
      })

      if (isApiSuccess(response)) {
        const payUrl = getAlipayPayUrl(response.data)
        if (payUrl) {
          if (!isSafePaymentRedirectUrl(payUrl)) {
            toast.error(i18next.t('Invalid payment redirect URL'))
            return false
          }
          window.open(payUrl, '_blank')
          toast.success(i18next.t('Redirecting to payment page...'))
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

  return { processing, processAlipayPayment }
}
