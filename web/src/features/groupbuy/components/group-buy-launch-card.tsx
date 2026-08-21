import { useTranslation } from 'react-i18next'

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
import { Handshake, Loader2 } from '@/components/icons'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TitledCard } from '@/components/ui/titled-card'
import { PaymentQrDialog } from '@/features/wallet/components/dialogs/payment-qr-dialog'

import { useGroupBuyLaunch } from '../hooks/use-group-buy-launch'
import { useGroupBuyPayment } from '../hooks/use-group-buy-payment'
import { formatShare, packageInfo } from '../lib'

export function GroupBuyLaunchCard() {
  const { t } = useTranslation()
  const { enabled, packages } = useGroupBuyLaunch()
  const {
    payWay,
    setPayWay,
    payOptions,
    loading: paymentMethodsLoading,
    submittingId,
    create,
    qrPay,
    closeQrPay,
  } = useGroupBuyPayment({ redirectAfterPay: true })

  if (!enabled || packages.length === 0) return null

  const currentPayLabel =
    payOptions.find((o) => o.value === payWay)?.label ??
    t('Select payment method')

  return (
    <>
      <TitledCard
        title={t('Group Buy Top-up')}
        description={t(
          'Start a group and invite friends to top up together for a better deal'
        )}
        icon={<Handshake className='h-4 w-4' />}
        contentClassName='space-y-4'
      >
        <div className='flex items-center gap-2'>
          <span className='text-sm'>{t('Payment Method')}</span>
          <Select
            items={payOptions}
            value={payWay}
            onValueChange={(v) => v && setPayWay(v)}
            disabled={paymentMethodsLoading || payOptions.length === 0}
          >
            <SelectTrigger className='h-8 w-[160px]'>
              <SelectValue>{currentPayLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {payOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {!paymentMethodsLoading && payOptions.length === 0 && (
          <p className='text-destructive text-sm' role='status'>
            {t('No payment methods available. Please contact administrator.')}
          </p>
        )}

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          {packages.map((pkg) => {
            const info = packageInfo(pkg)
            const tiered = info.minCount !== info.maxCount
            return (
              <div
                key={pkg.id}
                className='border-border flex flex-col gap-2 rounded-xl border p-4'
              >
                <div className='flex items-center justify-between'>
                  <span className='font-semibold'>{pkg.name}</span>
                  <StatusBadge
                    label={
                      tiered
                        ? `${info.minCount}-${info.maxCount} ${t('tiered')}`
                        : `${info.maxCount} ${t('to form group')}`
                    }
                    variant='info'
                    copyable={false}
                  />
                </div>
                {pkg.description ? (
                  <span className='text-muted-foreground text-xs'>
                    {pkg.description}
                  </span>
                ) : null}
                <div className='flex items-baseline gap-2'>
                  <span className='text-primary text-2xl font-bold'>
                    ¥{info.price.toFixed(2)}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    / {t('per person')}
                  </span>
                </div>
                <span className='text-muted-foreground text-xs'>
                  {tiered
                    ? `${info.minCount} ${t('people get')} ${formatShare(info.floorAmount)} → ${info.maxCount} ${t('people get')} ${formatShare(info.bestAmount)}`
                    : `${t('each gets')} ${formatShare(info.bestAmount)}`}
                </span>
                <Button
                  className='mt-1'
                  disabled={
                    paymentMethodsLoading ||
                    payOptions.length === 0 ||
                    submittingId === pkg.id
                  }
                  onClick={() => create(pkg.id)}
                >
                  {submittingId === pkg.id && (
                    <Loader2 className='mr-2 size-4 animate-spin' />
                  )}
                  {t('Start Group Buy')}
                </Button>
              </div>
            )
          })}
        </div>
      </TitledCard>

      <PaymentQrDialog
        open={qrPay.open}
        qrCode={qrPay.qr}
        tradeNo={qrPay.tradeNo}
        provider={qrPay.provider}
        onClose={closeQrPay}
      />
    </>
  )
}
