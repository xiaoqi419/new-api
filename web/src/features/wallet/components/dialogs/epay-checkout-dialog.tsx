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

import { CopyButton } from '@/components/copy-button'
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
  t: (key: string) => string,
  isCryptoCheckout: boolean
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
    description: isCryptoCheckout
      ? t('Send the exact amount to the address shown.')
      : t('Scan the QR code to complete your payment.'),
    icon: Loader2,
    tone: 'text-primary',
  }
}

function toEpochMilliseconds(timestamp: number): number {
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
}

function formatCountdown(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function getGMPayFeeSourceLabel(
  source: string,
  t: (key: string) => string
): string {
  switch (source) {
    case 'gateway_quote':
      return t('Gateway quote')
    case 'gateway_included':
      return t('Included in gateway amount')
    case 'admin_fixed':
      return t('Administrator fixed fee')
    case 'admin_percent':
      return t('Administrator percentage fee')
    default:
      return t('Unknown')
  }
}

export function EpayCheckoutDialog(props: EpayCheckoutDialogProps) {
  const { t } = useTranslation()
  const [checkoutStatus, setCheckoutStatus] =
    useState<CheckoutStatus>('waiting')
  const [refreshing, setRefreshing] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const refreshRef = useRef<(manual?: boolean) => void>(() => undefined)
  const checkoutOpen = props.open
  const activeCheckout = props.checkout
  const getCheckoutStatus = props.getStatus
  const handleSuccess = props.onSuccess

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
  }, [])

  const stopCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!checkoutOpen || !activeCheckout) {
      stopPolling()
      stopCountdown()
      refreshRef.current = () => undefined
      return
    }

    let active = true
    let checking = false
    const startedAt = Date.now()
    const isCryptoCheckout = activeCheckout.checkout_type === 'crypto'
    let expiresAt = 0
    if (isCryptoCheckout) {
      expiresAt = activeCheckout.server_time
        ? startedAt +
          (toEpochMilliseconds(activeCheckout.expiration_time) -
            toEpochMilliseconds(activeCheckout.server_time))
        : toEpochMilliseconds(activeCheckout.expiration_time)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a changed order starts a fresh status observation lifecycle
    setCheckoutStatus('waiting')

    const updateCountdown = () => {
      if (!isCryptoCheckout) return false

      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      if (active) setRemainingSeconds(seconds)
      if (seconds === 0) {
        stopPolling()
        stopCountdown()
        if (active) setCheckoutStatus('expired')
        return true
      }
      return false
    }

    if (!isCryptoCheckout) {
      setRemainingSeconds(null)
    }

    const refresh = async (manual = false) => {
      if (!active || checking) return
      if (!manual && updateCountdown()) return
      if (!manual && Date.now() - startedAt >= POLL_MAX_SECONDS * 1000) {
        stopPolling()
        stopCountdown()
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
          stopCountdown()
          setCheckoutStatus('success')
          toast.success(t('Payment successful'))
          await handleSuccess()
          return
        }
        if (status === 'failed' || status === 'expired') {
          stopPolling()
          stopCountdown()
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
    const expired = updateCountdown()
    if (!expired) {
      void refresh()
      pollingTimerRef.current = setInterval(
        () => void refresh(),
        POLL_INTERVAL_MS
      )
      if (isCryptoCheckout) {
        countdownTimerRef.current = setInterval(updateCountdown, 1000)
      }
    }

    return () => {
      active = false
      refreshRef.current = () => undefined
      stopPolling()
      stopCountdown()
    }
  }, [
    activeCheckout,
    checkoutOpen,
    getCheckoutStatus,
    handleSuccess,
    stopCountdown,
    stopPolling,
    t,
  ])

  const checkout = props.checkout
  if (!checkout) return null

  const isCryptoCheckout = checkout.checkout_type === 'crypto'
  const statusContent = getStatusContent(checkoutStatus, t, isCryptoCheckout)
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
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-3xl'
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
      <div className='grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,260px)] sm:items-center'>
        <div className='order-2 space-y-3 sm:order-1'>
          {isCryptoCheckout ? (
            <dl className='space-y-2 text-sm'>
              {(checkout.base_amount !== undefined ||
                checkout.fee_amount !== undefined ||
                checkout.total_amount !== undefined ||
                checkout.fee_source !== undefined) && (
                <>
                  <div className='flex items-center justify-between gap-4'>
                    <dt className='text-muted-foreground'>
                      {t('Base amount')}
                    </dt>
                    <dd className='font-semibold'>
                      {checkout.base_amount ?? checkout.money}
                    </dd>
                  </div>
                  {checkout.fee_amount !== undefined && (
                    <div className='flex items-start justify-between gap-4'>
                      <dt className='text-muted-foreground'>{t('Fee')}</dt>
                      <dd className='text-right font-semibold'>
                        <span>{checkout.fee_amount}</span>
                        {checkout.fee_source ? (
                          <span className='text-muted-foreground block text-xs font-normal'>
                            {t('Fee source: {{source}}', {
                              source: getGMPayFeeSourceLabel(
                                checkout.fee_source,
                                t
                              ),
                            })}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  )}
                  <div className='flex items-center justify-between gap-4'>
                    <dt className='text-muted-foreground'>
                      {t('Total payment')}
                    </dt>
                    <dd className='font-semibold'>
                      {checkout.total_amount ?? checkout.money}
                    </dd>
                  </div>
                </>
              )}
              <div className='flex items-center justify-between gap-4'>
                <dt className='text-muted-foreground'>{t('Amount to send')}</dt>
                <dd className='flex items-center gap-1 font-mono font-semibold'>
                  <span>{`${checkout.actual_amount} ${checkout.token}`}</span>
                  <CopyButton
                    value={checkout.actual_amount}
                    variant='ghost'
                    size='icon'
                    className='size-6'
                    iconClassName='size-3.5'
                    tooltip={t('Copy payment amount')}
                    successTooltip={t('Copied')}
                    aria-label={t('Copy payment amount')}
                  />
                </dd>
              </div>
              <div className='flex items-center justify-between gap-4'>
                <dt className='text-muted-foreground'>{t('Network')}</dt>
                <dd className='max-w-full text-right font-medium break-words'>
                  {checkout.network}
                </dd>
              </div>
              <div className='flex items-start justify-between gap-4'>
                <dt className='text-muted-foreground'>
                  {t('Receive address')}
                </dt>
                <dd className='flex max-w-full min-w-0 items-start gap-1 text-right font-mono text-xs [overflow-wrap:anywhere]'>
                  <span className='min-w-0 flex-1 [overflow-wrap:anywhere]'>
                    {checkout.receive_address}
                  </span>
                  <CopyButton
                    value={checkout.receive_address}
                    variant='ghost'
                    size='icon'
                    className='size-6'
                    iconClassName='size-3.5'
                    tooltip={t('Copy payment address')}
                    successTooltip={t('Copied')}
                    aria-label={t('Copy payment address')}
                  />
                </dd>
              </div>
              <div className='flex items-start justify-between gap-4'>
                <dt className='text-muted-foreground'>{t('Order number')}</dt>
                <dd className='max-w-full text-right font-mono text-xs [overflow-wrap:anywhere]'>
                  {checkout.trade_no}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-4'>
                <dt className='text-muted-foreground'>{t('Expires in')}</dt>
                <dd className='font-mono font-medium'>
                  {formatCountdown(remainingSeconds ?? 0)}
                </dd>
              </div>
            </dl>
          ) : (
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
          )}

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

        <div className='order-1 mx-auto shrink-0 bg-white p-3 sm:order-2'>
          <QRCodeSVG
            value={
              isCryptoCheckout
                ? checkout.receive_address
                : checkout.checkout_value
            }
            size={240}
            className='size-[208px] max-[390px]:size-[208px] sm:size-[240px]'
            aria-label={t('Payment QR code')}
          />
        </div>
      </div>
    </Dialog>
  )
}
