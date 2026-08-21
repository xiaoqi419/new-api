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
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { PaymentQrProvider } from '@/features/wallet/components/dialogs/payment-qr-dialog'
import { openGroupBuyEpayCheckout } from '@/features/wallet/lib/payment'
import type { EpayCheckoutData } from '@/features/wallet/types'

import {
  cancelGroupBuyPayment,
  createGroupBuy,
  getGroupBuyInfo,
  joinGroupBuy,
} from '../api'
import { NON_EPAY_PAY_METHODS, PAY_ALIPAY, PAY_WECHAT } from '../constants'
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
  const [epayCheckout, setEpayCheckout] = useState<EpayCheckoutData | null>(
    null
  )
  const epayGroupNoRef = useRef<string | undefined>(undefined)
  const epayRetryRef = useRef<
    | { kind: 'create'; value: number; money?: string | number }
    | { kind: 'join'; value: string; money?: string | number }
    | null
  >(null)

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
    (data: PaymentResultData, groupNo?: string, money?: string | number) => {
      const isEpay = !NON_EPAY_PAY_METHODS.has(payWay)
      const opened = isEpay
        ? openGroupBuyEpayCheckout(
            data,
            { paymentMethod: payWay, money },
            setEpayCheckout
          )
        : false
      if (opened) {
        epayGroupNoRef.current = groupNo ?? data.group_no
        return
      }
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
      toast.error(i18next.t('Payment request failed'))
    },
    [payWay]
  )

  const create = useCallback(
    async (packageId: number, money?: string | number) => {
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
          if (
            payWay === PAY_WECHAT &&
            data.h5_url &&
            isSafeHttpUrl(data.h5_url)
          ) {
            window.location.href = data.h5_url
            return
          }
          epayRetryRef.current = { kind: 'create', value: packageId, money }
          handlePayData(data, data.group_no, money)
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
    async (groupNo: string, money?: string | number) => {
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
          if (
            payWay === PAY_WECHAT &&
            data.h5_url &&
            isSafeHttpUrl(data.h5_url)
          ) {
            window.location.href = data.h5_url
            return
          }
          epayRetryRef.current = { kind: 'join', value: groupNo, money }
          handlePayData(data, groupNo, money)
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

  const closeEpayCheckout = useCallback(
    (paid: boolean) => {
      const checkout = epayCheckout
      setEpayCheckout(null)
      if (paid) {
        onPaid?.(epayGroupNoRef.current)
        if (redirectAfterPay) goDetail(epayGroupNoRef.current)
        return
      }
      if (checkout?.trade_no) {
        void cancelGroupBuyPayment(checkout.trade_no).catch(() => undefined)
      }
    },
    [epayCheckout, goDetail, onPaid, redirectAfterPay]
  )

  const retryEpayCheckout = useCallback(async () => {
    const action = epayRetryRef.current
    const previousTradeNo = epayCheckout?.trade_no
    setEpayCheckout(null)
    if (previousTradeNo) {
      await cancelGroupBuyPayment(previousTradeNo).catch(() => undefined)
    }
    if (!action) return
    if (action.kind === 'create') {
      await create(action.value, action.money)
    } else {
      await join(action.value, action.money)
    }
  }, [create, epayCheckout?.trade_no, join])

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
    epayCheckout,
    closeEpayCheckout,
    retryEpayCheckout,
    scene,
  }
}
