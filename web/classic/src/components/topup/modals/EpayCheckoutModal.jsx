/*
Copyright (C) 2025 QuantumNous

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

import { Modal, Button, Banner, Spin, Typography } from '@douyinfe/semi-ui'
import { RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 3000
const POLL_MAX_SECONDS = 300

function getStatusInfo(status, t) {
  switch (status) {
    case 'success':
      return { text: t('支付成功'), type: 'success' }
    case 'failed':
      return { text: t('支付失败'), type: 'danger' }
    case 'expired':
      return { text: t('支付已过期'), type: 'warning' }
    case 'timeout':
      return { text: t('支付状态检查超时'), type: 'warning' }
    default:
      return { text: t('等待支付'), type: 'info' }
  }
}

export default function EpayCheckoutModal({
  t,
  visible,
  checkout,
  getStatus,
  onSuccess,
  onCancel,
  onRetry,
}) {
  const [status, setStatus] = useState('waiting')
  const [refreshing, setRefreshing] = useState(false)
  const timerRef = useRef(null)
  const refreshRef = useRef(() => undefined)
  const callbackRef = useRef({ getStatus, onSuccess, onCancel, onRetry })

  useEffect(() => {
    callbackRef.current = { getStatus, onSuccess, onCancel, onRetry }
  }, [getStatus, onSuccess, onCancel, onRetry])

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!visible || !checkout) {
      stopPolling()
      refreshRef.current = () => undefined
      return undefined
    }
    let active = true
    let checking = false
    const startedAt = Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a new order resets its polling lifecycle
    setStatus('waiting')

    const refresh = async (manual = false) => {
      if (!active || checking) return
      if (!manual && Date.now() - startedAt >= POLL_MAX_SECONDS * 1000) {
        stopPolling()
        if (active) setStatus('timeout')
        return
      }
      checking = true
      if (manual) setRefreshing(true)
      try {
        const response = await callbackRef.current.getStatus(checkout.trade_no)
        const payload = response?.data?.status ? response.data : response
        const nextStatus = payload?.data?.status || payload?.status
        if (!active || !nextStatus) return
        const normalizedStatus = String(nextStatus).toLowerCase()
        if (normalizedStatus === 'success') {
          stopPolling()
          setStatus('success')
          await callbackRef.current.onSuccess?.()
        } else if (
          normalizedStatus === 'failed' ||
          normalizedStatus === 'expired'
        ) {
          stopPolling()
          setStatus(normalizedStatus)
        }
      } catch {
        // Payment callbacks can lag; continue polling until the timeout window.
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
  }, [checkout, visible, stopPolling])

  if (!checkout) return null

  const statusInfo = getStatusInfo(status, t)
  const canRetry = ['failed', 'expired'].includes(status)

  const close = () => {
    stopPolling()
    onCancel?.(status === 'success')
  }

  return (
    <Modal
      title={t('支付收银台')}
      visible={visible}
      onCancel={close}
      centered
      maskClosable={false}
      size='small'
      footer={
        <div className='flex flex-wrap justify-end gap-2'>
          <Button onClick={close}>{t('返回')}</Button>
          {canRetry && onRetry && (
            <Button onClick={onRetry} icon={<RefreshCw size={14} />}>
              {t('重试')}
            </Button>
          )}
          <Button
            onClick={() => refreshRef.current(true)}
            disabled={refreshing}
            icon={
              <RefreshCw
                size={14}
                className={refreshing ? 'animate-spin' : ''}
              />
            }
          >
            {t('刷新支付状态')}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col items-center gap-4'>
        <div className='flex w-full flex-col gap-2 text-sm'>
          <div className='flex justify-between gap-3'>
            <Typography.Text type='tertiary'>{t('应付金额')}</Typography.Text>
            <Typography.Text strong>{checkout.money}</Typography.Text>
          </div>
          <div className='flex justify-between gap-3'>
            <Typography.Text type='tertiary'>{t('支付方式')}</Typography.Text>
            <Typography.Text>{checkout.payment_method}</Typography.Text>
          </div>
          <div className='flex justify-between gap-3'>
            <Typography.Text type='tertiary'>{t('订单号')}</Typography.Text>
            <Typography.Text ellipsis={{ showTooltip: true }}>
              {checkout.trade_no}
            </Typography.Text>
          </div>
        </div>
        <div className='bg-white p-3'>
          <QRCodeSVG
            value={checkout.checkout_value}
            size={240}
            className='h-[240px] w-[240px] max-[390px]:h-[208px] max-[390px]:w-[208px]'
            aria-label={t('支付二维码')}
          />
        </div>
        <Banner
          type={statusInfo.type}
          description={statusInfo.text}
          closeIcon={null}
        />
        {status === 'waiting' && <Spin size='small' />}
      </div>
    </Modal>
  )
}
