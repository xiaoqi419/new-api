import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
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
import { Loader2 } from '@/components/icons'

import { getTradeStatus } from '../api'
import { POLL_INTERVAL_MS, POLL_MAX_SECONDS } from '../constants'

interface WechatPayDialogProps {
  open: boolean
  qrCode: string
  tradeNo: string
  onClose: (paid: boolean) => void
}

export function WechatPayDialog({
  open,
  qrCode,
  tradeNo,
  onClose,
}: WechatPayDialogProps) {
  const { t } = useTranslation()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!open || !tradeNo) return
    let elapsed = 0
    const stop = () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
    const tick = async () => {
      elapsed += POLL_INTERVAL_MS / 1000
      try {
        const res = await getTradeStatus(tradeNo)
        const status = res.data?.status
        if (res.message === 'success' && status) {
          if (status === 'success') {
            stop()
            toast.success(t('Payment successful'))
            onCloseRef.current(true)
            return
          }
          if (status === 'expired' || status === 'failed') {
            stop()
            toast.error(t('Payment not completed'))
            onCloseRef.current(false)
            return
          }
        }
      } catch {
        // ignore polling errors, keep retrying until timeout
      }
      if (elapsed >= POLL_MAX_SECONDS) stop()
    }
    timerRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS)
    return stop
  }, [open, tradeNo, t])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose(false)
      }}
      title={t('Scan to pay with WeChat')}
      contentClassName='sm:max-w-sm'
    >
      <div className='flex flex-col items-center gap-3 py-2'>
        {qrCode ? (
          <img
            src={qrCode}
            alt={t('WeChat payment QR code')}
            className='size-56 rounded-md'
          />
        ) : (
          <Loader2 className='text-primary size-10 animate-spin' />
        )}
        <p className='text-muted-foreground text-center text-sm'>
          {t(
            'Scan the QR code with WeChat to pay. Your balance updates automatically after payment.'
          )}
        </p>
      </div>
    </Dialog>
  )
}
