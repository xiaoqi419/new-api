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
import { useNavigate } from '@tanstack/react-router'
import i18next from 'i18next'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { PaymentQrProvider } from '@/features/wallet/components/dialogs/payment-qr-dialog'

import {
  cancelGroupBuyPayment,
  createGroupBuy,
  getGroupBuyInfo,
  joinGroupBuy,
} from '../api'
import { PAY_ALIPAY, PAY_WECHAT } from '../constants'
import { isSafeHttpUrl } from '../lib'
import { detectGroupBuyScene } from '../lib/payment-scene'
import type { GroupBuyPayMethod, PaymentResultData } from '../types'

interface QrPayState {
  open: boolean
  qr: string
  tradeNo: string
  provider: PaymentQrProvider
  groupNo?: string
}

interface UseGroupBuyPaymentOptions {
  /** Called after a scan-to-pay order is confirmed successful. */
  onPaid?: (groupNo?: string) => void
  /** When true, navigate to the group detail after opening an external pay page. */
  redirectAfterPay?: boolean
}

/** What must happen after the scan-to-pay dialog closes. */
export interface CheckoutCloseAction {
  /** Trade number whose seat reservation should be released, if any. */
  releaseTradeNo: string | null
  /** Group to navigate into, if any. */
  navigateToGroup: string | null
}

export interface GroupBuyPaymentOption {
  value: string
  label: string
}

export function normalizePaymentMethods(
  methods: GroupBuyPayMethod[] | undefined
): GroupBuyPaymentOption[] {
  const seen = new Set<string>()
  const options: GroupBuyPaymentOption[] = []

  for (const method of methods ?? []) {
    const value = method.type?.trim()
    const configuredLabel = method.name?.trim()
    if (!value || !configuredLabel || seen.has(value)) continue

    let label = configuredLabel
    if (value === PAY_WECHAT) label = i18next.t('WeChat Pay')
    if (value === PAY_ALIPAY) label = i18next.t('Alipay')

    seen.add(value)
    options.push({ value, label })
  }

  return options
}

/**
 * Abandoning checkout must never navigate into the group: the user cancelled,
 * so nothing happened. Landing on the group page reads as "I got joined anyway".
 * Navigation belongs to the paid branch only.
 */
export function resolveCheckoutClose(params: {
  paid: boolean
  tradeNo: string
  groupNo?: string
  redirectAfterPay?: boolean
}): CheckoutCloseAction {
  const { paid, tradeNo, groupNo, redirectAfterPay } = params
  if (paid) {
    return {
      releaseTradeNo: null,
      navigateToGroup: redirectAfterPay ? (groupNo ?? null) : null,
    }
  }
  return { releaseTradeNo: tradeNo || null, navigateToGroup: null }
}

function submitEpayForm(action: string, params: Record<string, string>) {
  const form = document.createElement('form')
  form.action = action
  form.method = 'POST'
  form.target = '_blank'
  for (const key of Object.keys(params)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = params[key]
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
  document.body.removeChild(form)
}

export function useGroupBuyPayment(options: UseGroupBuyPaymentOptions = {}) {
  const { onPaid, redirectAfterPay } = options
  const navigate = useNavigate()
  const scene = detectGroupBuyScene()
  const [payWay, setPayWayState] = useState('')
  const [payOptions, setPayOptions] = useState<GroupBuyPaymentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [submittingId, setSubmittingId] = useState<string | number | null>(null)
  const [qrPay, setQrPay] = useState<QrPayState>({
    open: false,
    qr: '',
    tradeNo: '',
    provider: 'wechat',
  })

  useEffect(() => {
    let active = true
    void getGroupBuyInfo(scene)
      .then((res) => {
        if (!active || !res.success || !res.data) return
        const nextOptions = normalizePaymentMethods(res.data.payment_methods)
        setPayOptions(nextOptions)
        setPayWayState((current) => {
          if (nextOptions.some((option) => option.value === current)) {
            return current
          }
          return nextOptions[0]?.value ?? ''
        })
      })
      .catch(() => {
        /* handled by response interceptor */
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [scene])

  const setPayWay = useCallback(
    (value: string) => {
      if (payOptions.some((option) => option.value === value)) {
        setPayWayState(value)
      }
    },
    [payOptions]
  )

  const goDetail = useCallback(
    (groupNo?: string) => {
      if (groupNo) navigate({ to: '/groupbuy/detail', search: { no: groupNo } })
    },
    [navigate]
  )

  const handlePayData = useCallback(
    (data: PaymentResultData, groupNo?: string) => {
      if (data.qr_code) {
        setQrPay({
          open: true,
          qr: data.qr_code,
          tradeNo: data.trade_no ?? '',
          provider: payWay === PAY_ALIPAY ? 'alipay' : 'wechat',
          groupNo,
        })
        return
      }
      if (data.pay_url && isSafeHttpUrl(data.pay_url)) {
        window.open(data.pay_url, '_blank')
        if (redirectAfterPay) goDetail(groupNo)
        return
      }
      if (data.epay_url) {
        submitEpayForm(data.epay_url, data.epay_params ?? {})
        if (redirectAfterPay) goDetail(groupNo)
        return
      }
      toast.error(i18next.t('Payment request failed'))
    },
    [goDetail, redirectAfterPay, payWay]
  )

  const create = useCallback(
    async (packageId: number) => {
      if (!payOptions.some((option) => option.value === payWay)) {
        toast.error(
          i18next.t(
            'No payment methods available. Please contact administrator.'
          )
        )
        return
      }

      setSubmittingId(packageId)
      try {
        const res = await createGroupBuy({
          package_id: packageId,
          payment_method: payWay,
          scene,
        })
        if (
          res.message === 'success' &&
          res.data &&
          typeof res.data !== 'string'
        ) {
          const data = res.data
          if (data.h5_url && isSafeHttpUrl(data.h5_url)) {
            window.location.href = data.h5_url
            return
          }
          handlePayData(data, data.group_no)
        } else {
          toast.error(
            typeof res.data === 'string'
              ? res.data
              : res.message || i18next.t('Failed to start group buy')
          )
        }
      } catch {
        toast.error(i18next.t('Failed to start group buy'))
      } finally {
        setSubmittingId(null)
      }
    },
    [payWay, payOptions, scene, handlePayData]
  )

  const join = useCallback(
    async (groupNo: string) => {
      if (!payOptions.some((option) => option.value === payWay)) {
        toast.error(
          i18next.t(
            'No payment methods available. Please contact administrator.'
          )
        )
        return
      }

      setSubmittingId(groupNo)
      try {
        const res = await joinGroupBuy({
          group_no: groupNo,
          payment_method: payWay,
          scene,
        })
        if (
          res.message === 'success' &&
          res.data &&
          typeof res.data !== 'string'
        ) {
          const data = res.data
          if (data.h5_url && isSafeHttpUrl(data.h5_url)) {
            window.location.href = data.h5_url
            return
          }
          handlePayData(data, groupNo)
        } else {
          toast.error(
            typeof res.data === 'string'
              ? res.data
              : res.message || i18next.t('Failed to join group buy')
          )
        }
      } catch {
        toast.error(i18next.t('Failed to join group buy'))
      } finally {
        setSubmittingId(null)
      }
    },
    [payWay, payOptions, scene, handlePayData]
  )

  const closeQrPay = useCallback(
    (paid: boolean) => {
      const action = resolveCheckoutClose({
        paid,
        tradeNo: qrPay.tradeNo,
        groupNo: qrPay.groupNo,
        redirectAfterPay,
      })
      setQrPay((prev) => ({ ...prev, open: false }))
      if (paid) onPaid?.(qrPay.groupNo)
      if (action.releaseTradeNo) {
        void cancelGroupBuyPayment(action.releaseTradeNo).catch(() => {
          /* reservation still expires on its own */
        })
      }
      if (action.navigateToGroup) goDetail(action.navigateToGroup)
    },
    [qrPay, onPaid, redirectAfterPay, goDetail]
  )

  return {
    payWay,
    setPayWay,
    payOptions,
    loading,
    submittingId,
    create,
    join,
    qrPay,
    closeQrPay,
    scene,
  }
}
