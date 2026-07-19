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

import { createGroupBuy, getPayInfo, joinGroupBuy } from '../api'
import { NON_EPAY_PAY_METHODS, PAY_ALIPAY, PAY_WECHAT } from '../constants'
import { isSafeHttpUrl } from '../lib'
import type { GroupBuyPayMethod, PaymentResultData } from '../types'

interface WechatState {
  open: boolean
  qr: string
  tradeNo: string
  groupNo?: string
}

interface UseGroupBuyPaymentOptions {
  /** Called after a WeChat payment is confirmed successful. */
  onPaid?: (groupNo?: string) => void
  /** When true, navigate to the group detail after opening an external pay page. */
  redirectAfterPay?: boolean
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
  const [payWay, setPayWay] = useState(PAY_WECHAT)
  const [enableWechat, setEnableWechat] = useState(false)
  const [enableAlipay, setEnableAlipay] = useState(false)
  const [enableOnline, setEnableOnline] = useState(false)
  const [payMethods, setPayMethods] = useState<GroupBuyPayMethod[]>([])
  const [submittingId, setSubmittingId] = useState<string | number | null>(null)
  const [wechat, setWechat] = useState<WechatState>({
    open: false,
    qr: '',
    tradeNo: '',
  })

  useEffect(() => {
    let active = true
    getPayInfo()
      .then((res) => {
        if (!active || !res.success || !res.data) return
        const w = !!res.data.enable_wechatpay_topup
        const a = !!res.data.enable_alipay_topup
        const online = !!res.data.enable_online_topup
        const methods = res.data.pay_methods ?? []
        setEnableWechat(w)
        setEnableAlipay(a)
        setEnableOnline(online)
        setPayMethods(methods)
        const firstEpay = online
          ? methods.find((m) => !NON_EPAY_PAY_METHODS.has(m.type))
          : undefined
        if (w) setPayWay(PAY_WECHAT)
        else if (a) setPayWay(PAY_ALIPAY)
        else if (firstEpay) setPayWay(firstEpay.type)
      })
      .catch(() => {
        /* handled by response interceptor */
      })
    return () => {
      active = false
    }
  }, [])

  const goDetail = useCallback(
    (groupNo?: string) => {
      if (groupNo) navigate({ to: '/groupbuy/detail', search: { no: groupNo } })
    },
    [navigate]
  )

  const handlePayData = useCallback(
    (data: PaymentResultData, groupNo?: string) => {
      if (data.qr_code) {
        setWechat({
          open: true,
          qr: data.qr_code,
          tradeNo: data.trade_no ?? '',
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
    [goDetail, redirectAfterPay]
  )

  const detectScene = useCallback(() => {
    const ua = navigator.userAgent || ''
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    const inWeChat = /MicroMessenger/i.test(ua)
    return payWay === PAY_WECHAT && isMobile && !inWeChat ? 'h5' : 'native'
  }, [payWay])

  const create = useCallback(
    async (packageId: number) => {
      setSubmittingId(packageId)
      try {
        const res = await createGroupBuy({
          package_id: packageId,
          payment_method: payWay,
          scene: detectScene(),
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
    [payWay, detectScene, handlePayData]
  )

  const join = useCallback(
    async (groupNo: string) => {
      setSubmittingId(groupNo)
      try {
        const res = await joinGroupBuy({
          group_no: groupNo,
          payment_method: payWay,
          scene: detectScene(),
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
    [payWay, detectScene, handlePayData]
  )

  const closeWechat = useCallback(
    (paid: boolean) => {
      const groupNo = wechat.groupNo
      setWechat((prev) => ({ ...prev, open: false }))
      if (paid) onPaid?.(groupNo)
      else if (redirectAfterPay) goDetail(groupNo)
    },
    [wechat.groupNo, onPaid, redirectAfterPay, goDetail]
  )

  const payOptions: { value: string; label: string }[] = []
  if (enableWechat) {
    payOptions.push({ value: PAY_WECHAT, label: i18next.t('WeChat Pay') })
  }
  if (enableAlipay) {
    payOptions.push({ value: PAY_ALIPAY, label: i18next.t('Alipay') })
  }
  if (enableOnline) {
    for (const m of payMethods) {
      if (NON_EPAY_PAY_METHODS.has(m.type)) continue
      payOptions.push({ value: m.type, label: m.name })
    }
  }

  return {
    payWay,
    setPayWay,
    payOptions,
    submittingId,
    create,
    join,
    wechat,
    closeWechat,
  }
}
