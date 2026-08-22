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
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  Loader2,
  RefreshCw,
} from '@/components/icons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { isApiSuccess } from '../../api'
import { POLL_INTERVAL_MS, POLL_MAX_SECONDS } from '../../constants'
import type { EpayCheckoutData, TradeStatusResponse } from '../../types'

type CheckoutStatus = 'waiting' | 'success' | 'failed' | 'expired' | 'timeout'

interface EpayCheckoutDialogProps {
  open: boolean
  checkout: EpayCheckoutData | null
  getStatus: (tradeNo: string) => Promise<TradeStatusResponse>
  onClose: () => void
  onSuccess: () => void | Promise<void>
  onRetry?: () => void
}

function getStatusContent(
  status: CheckoutStatus,
  t: (key: string) => string
): { label: string; description: string; icon: typeof Clock; tone: string } {
  if (status === 'success') {
    return {
      label: t('Payment successful'),
      description: t('Payment completed. Returning to the previous page.'),
      icon: CheckCircle2,
      tone: 'text-success',
    }
  }
  if (status === 'failed') {
    return {
      label: t('Payment failed'),
      description: t('Payment failed. You can retry or return.'),
      icon: CircleAlert,
      tone: 'text-destructive',
    }
  }
  if (status === 'expired') {
    return {
      label: t('Payment expired'),
      description: t('Payment expired. You can retry or return.'),
      icon: CircleAlert,
      tone: 'text-destructive',
    }
  }
  if (status === 'timeout') {
    return {
      label: t('Payment status check timed out'),
      description: t(
        'Payment status check timed out. You can refresh manually.'
      ),
      icon: Clock,
      tone: 'text-warning',
    }
  }
  return {
    label: t('Waiting for payment'),
    description: t('Scan the QR code to complete your payment.'),
    icon: Loader2,
    tone: 'text-primary',
  }
}

export function EpayCheckoutDialog(props: EpayCheckoutDialogProps) {
  const { t } = useTranslation()
  const [checkoutStatus, setCheckoutStatus] =
    useState<CheckoutStatus>('waiting')
  const [refreshing, setRefreshing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const refreshRef = useRef<(manual?: boolean) => void>(() => undefined)
  const checkoutOpen = props.open
  const activeCheckout = props.checkout
  const getCheckoutStatus = props.getStatus
  const handleSuccess = props.onSuccess

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!checkoutOpen || !activeCheckout) {
      stopPolling()
      refreshRef.current = () => undefined
      return
    }

    let active = true
    let checking = false
    const startedAt = Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a changed order starts a fresh status observation lifecycle
    setCheckoutStatus('waiting')

    const refresh = async (manual = false) => {
      if (!active || checking) return
      if (!manual && Date.now() - startedAt >= POLL_MAX_SECONDS * 1000) {
        stopPolling()
        if (active) setCheckoutStatus('timeout')
        return
      }

      checking = true
      if (manual) setRefreshing(true)
      try {
        const response = await getCheckoutStatus(activeCheckout.trade_no)
        if (!active || !isApiSuccess(response)) return

        const status = response.data?.status?.toLowerCase()
        if (status === 'success') {
          stopPolling()
          setCheckoutStatus('success')
          toast.success(t('Payment successful'))
          await handleSuccess()
          return
        }
        if (status === 'failed' || status === 'expired') {
          stopPolling()
          setCheckoutStatus(status)
        }
      } catch {
        // Payment status can lag its webhook. Keep observing until the window ends.
      } finally {
        checking = false
        if (active && manual) setRefreshing(false)
      }
    }

    refreshRef.current = (manual = false) => void refresh(manual)
    void refresh()
    timerRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS)

    return () => {
      active = false
      refreshRef.current = () => undefined
      stopPolling()
    }
  }, [
    activeCheckout,
    checkoutOpen,
    getCheckoutStatus,
    handleSuccess,
    stopPolling,
    t,
  ])

  const checkout = props.checkout
  if (!checkout) return null

  const statusContent = getStatusContent(checkoutStatus, t)
  const StatusIcon = statusContent.icon
  const canRetry = checkoutStatus === 'failed' || checkoutStatus === 'expired'

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) props.onClose()
      }}
      title={t('Payment checkout')}
      description={t('Complete this payment without leaving the current page.')}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-lg'
      bodyClassName='space-y-5'
      footer={
        <div className='grid w-full grid-cols-1 gap-2 sm:flex sm:justify-between'>
          <Button variant='outline' onClick={props.onClose}>
            {t('Return')}
          </Button>
          <div className='flex flex-wrap justify-end gap-2'>
            {canRetry && props.onRetry ? (
              <Button variant='outline' onClick={props.onRetry}>
                <RefreshCw className='mr-2 size-4' />
                {t('Retry')}
              </Button>
            ) : null}
            <Button
              variant='outline'
              onClick={() => refreshRef.current(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={`mr-2 size-4 ${refreshing ? 'animate-spin' : ''}`}
              />
              {t('Refresh payment status')}
            </Button>
          </div>
        </div>
      }
    >
      <div className='grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
        <div className='order-2 space-y-3 sm:order-1'>
          <dl className='space-y-2 text-sm'>
            <div className='flex items-center justify-between gap-4'>
              <dt className='text-muted-foreground'>{t('Amount Due')}</dt>
              <dd className='font-semibold'>{checkout.money}</dd>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <dt className='text-muted-foreground'>{t('Payment Method')}</dt>
              <dd className='font-medium'>{checkout.payment_method}</dd>
            </div>
            <div className='flex items-start justify-between gap-4'>
              <dt className='text-muted-foreground'>{t('Order number')}</dt>
              <dd className='max-w-[230px] text-right font-mono text-xs break-all'>
                {checkout.trade_no}
              </dd>
            </div>
          </dl>

          <Alert>
            <StatusIcon
              className={`size-4 shrink-0 ${statusContent.tone} ${checkoutStatus === 'waiting' ? 'animate-spin' : ''}`}
            />
            <AlertDescription>
              <span className='block font-medium'>{statusContent.label}</span>
              <span className='text-muted-foreground block text-xs'>
                {statusContent.description}
              </span>
            </AlertDescription>
          </Alert>
        </div>

        <div className='order-1 mx-auto bg-white p-3 sm:order-2'>
          <QRCodeSVG
            value={checkout.checkout_value}
            size={240}
            className='size-[208px] max-[390px]:size-[208px] sm:size-[240px]'
            aria-label={t('Payment QR code')}
          />
        </div>
      </div>
    </Dialog>
  )
}
