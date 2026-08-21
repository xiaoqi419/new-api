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
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  isApiSuccess,
  requestWechatJsapiPrepare,
  requestWechatPayment,
} from '../api'
import { PAYMENT_TYPES } from '../constants'
import { isSafePaymentRedirectUrl } from '../lib/payment'
import type { ApiResponse, TopupInfo } from '../types'

export type WechatPaymentScene = 'native' | 'h5' | 'jsapi'

export interface WechatPaymentCapabilities {
  native: boolean
  h5: boolean
  jsapi: boolean
}

export interface WechatQrAction {
  type: 'qr'
  qrCode: string
  tradeNo: string
}

export interface WechatRedirectAction {
  type: 'redirect'
  url: string
}

export type WechatPaymentAction = WechatQrAction | WechatRedirectAction

export function selectWechatPaymentScene(
  userAgent: string,
  capabilities: WechatPaymentCapabilities
): WechatPaymentScene | null {
  const inWechat = /MicroMessenger/i.test(userAgent)
  if (inWechat && capabilities.jsapi) {
    return 'jsapi'
  }

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
  if (!inWechat && isMobile && capabilities.h5) {
    return 'h5'
  }

  return capabilities.native ? 'native' : null
}

export function getWechatPaymentAction(
  scene: WechatPaymentScene,
  data: unknown
): WechatPaymentAction | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  const fields = data as Record<string, unknown>

  if (scene === 'native') {
    const qrCode =
      typeof fields.qr_code === 'string' ? fields.qr_code.trim() : ''
    const tradeNo =
      typeof fields.trade_no === 'string' ? fields.trade_no.trim() : ''
    return qrCode && tradeNo ? { type: 'qr', qrCode, tradeNo } : null
  }

  const field = scene === 'h5' ? 'h5_url' : 'authorize_url'
  const value = fields[field]
  const url = typeof value === 'string' ? value.trim() : ''
  if (!isSafePaymentRedirectUrl(url)) {
    return null
  }
  return { type: 'redirect', url }
}

export function getWechatPaymentFailureMessage(response: ApiResponse): string {
  if (typeof response.data === 'string' && response.data.trim()) {
    return response.data
  }
  if (response.message && response.message !== 'success') {
    return response.message
  }
  return i18next.t('Payment request failed') || 'Payment request failed'
}

function hasUnsafeRedirectResponse(
  scene: WechatPaymentScene,
  data: unknown
): boolean {
  if (scene === 'native' || !data || typeof data !== 'object') {
    return false
  }

  const field = scene === 'h5' ? 'h5_url' : 'authorize_url'
  const value = (data as Record<string, unknown>)[field]
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    !isSafePaymentRedirectUrl(value)
  )
}

export interface WechatQrOrder {
  qrCode: string
  tradeNo: string
}

export function useWechatPayment(topupInfo: TopupInfo | null) {
  const [processing, setProcessing] = useState(false)
  const [qrOrder, setQrOrder] = useState<WechatQrOrder | null>(null)
  const wechatEnabled = topupInfo?.enable_wechatpay_topup === true
  const nativeEnabled = topupInfo?.wechatpay_native === true
  const h5Enabled = topupInfo?.wechatpay_h5 === true
  const jsapiEnabled = topupInfo?.wechatpay_jsapi === true

  const processWechatPayment = useCallback(
    async (topupAmount: number) => {
      const scene = selectWechatPaymentScene(navigator.userAgent || '', {
        native: wechatEnabled && nativeEnabled,
        h5: wechatEnabled && h5Enabled,
        jsapi: wechatEnabled && jsapiEnabled,
      })
      if (!scene) {
        toast.error(getWechatPaymentFailureMessage({}))
        return false
      }

      setProcessing(true)
      try {
        const amount = Math.floor(topupAmount)
        const response =
          scene === 'jsapi'
            ? await requestWechatJsapiPrepare({ amount })
            : await requestWechatPayment({
                amount,
                payment_method: PAYMENT_TYPES.WECHAT_DIRECT,
                scene,
              })

        if (isApiSuccess(response)) {
          const action = getWechatPaymentAction(scene, response.data)
          if (action?.type === 'qr') {
            setQrOrder({ qrCode: action.qrCode, tradeNo: action.tradeNo })
            return true
          }
          if (action?.type === 'redirect') {
            toast.success(i18next.t('Redirecting to payment page...'))
            window.location.assign(action.url)
            return true
          }
          if (hasUnsafeRedirectResponse(scene, response.data)) {
            toast.error(i18next.t('Invalid payment redirect URL'))
            return false
          }
        }

        toast.error(getWechatPaymentFailureMessage(response))
        return false
      } catch {
        toast.error(getWechatPaymentFailureMessage({}))
        return false
      } finally {
        setProcessing(false)
      }
    },
    [h5Enabled, jsapiEnabled, nativeEnabled, wechatEnabled]
  )

  const closeWechatQr = useCallback(() => setQrOrder(null), [])

  return { processing, processWechatPayment, qrOrder, closeWechatQr }
}
