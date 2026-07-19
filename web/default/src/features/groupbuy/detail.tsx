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
import { CalendarClock, CircleCheck, Server, Users, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { formatTimestampToDate } from '@/lib/format'

import { GroupBuyCountdown } from './components/group-buy-countdown'
import { JoinPanel } from './components/join-panel'
import { MembersList } from './components/members-list'
import { TierLadder } from './components/tier-ladder'
import { WechatPayDialog } from './components/wechat-pay-dialog'
import { useGroupBuyDetail } from './hooks/use-group-buy-detail'
import { useGroupBuyPayment } from './hooks/use-group-buy-payment'
import { formatShare, resolveTiers } from './lib'
import type { GroupBuyDetail } from './types'

interface GroupBuyDetailPageProps {
  no: string
}

export function GroupBuyDetailPage({ no }: GroupBuyDetailPageProps) {
  const { t } = useTranslation()
  const { loading, detail, reload } = useGroupBuyDetail(no)

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Group Buy')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-4'>
          {loading && <Skeleton className='h-72 w-full rounded-2xl' />}

          {!loading && !detail && (
            <Alert variant='destructive'>
              <AlertDescription>
                {t('Group buy not found or has expired')}
              </AlertDescription>
            </Alert>
          )}

          {!loading && detail && (
            <GroupBuyDetailBody detail={detail} no={no} onPaid={reload} />
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

interface GroupBuyDetailBodyProps {
  detail: GroupBuyDetail
  no: string
  onPaid: () => void
}

function GroupBuyDetailBody({ detail, no, onPaid }: GroupBuyDetailBodyProps) {
  const { t } = useTranslation()
  const {
    payWay,
    setPayWay,
    payOptions,
    submittingId,
    join,
    wechat,
    closeWechat,
  } = useGroupBuyPayment({ onPaid })

  const tiers = resolveTiers(detail)
  const last = tiers.at(-1) ?? tiers[0]
  const maxCount = last.count
  const bestAmount = last.per_share_amount
  const cap = detail.target_count || maxCount || 1
  const paid = detail.paid_count ?? 0
  const remaining = Math.max(0, cap - paid)
  const percent = Math.min(100, Math.round((paid / cap) * 100))
  const expired = detail.expire_time * 1000 < Date.now()
  const currentAmount = detail.current_amount || tiers[0].per_share_amount
  const canJoin =
    detail.status === 'pending' && !detail.joined && !expired && remaining > 0
  const price = Number(detail.per_share_price).toFixed(2)
  const subscriptionReward = (detail.reward_subscription_plan_id ?? 0) > 0
  const statusLabels: Record<string, string> = {
    success: t('Formed'),
    failed: t('Failed'),
  }
  const statusText = statusLabels[detail.status] ?? t('In Progress')
  const shareLink = `${window.location.origin}/groupbuy/detail?no=${encodeURIComponent(no)}`
  const notes =
    detail.notes && detail.notes.length > 0
      ? detail.notes
      : [
          t(
            'Payment locks your slot; quota is credited immediately once the group succeeds.'
          ),
          t(
            'The more members within the validity window, the higher the amount everyone receives.'
          ),
          t(
            'If the minimum group size is not met, the group fails and payments are refunded automatically.'
          ),
        ]

  return (
    <>
      {/* Hero */}
      <div className='from-primary to-primary/70 overflow-hidden rounded-2xl bg-gradient-to-br text-white shadow-sm'>
        <div className='flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between'>
          <div className='min-w-0'>
            <div className='flex items-center gap-3'>
              <h2 className='m-0 text-2xl font-bold'>
                {detail.package_name || t('Group Buy Top-up')}
              </h2>
              <span className='text-primary shrink-0 rounded-full bg-white/95 px-3 py-1 text-xs font-medium'>
                {statusText}
              </span>
            </div>
            <div className='mt-3 flex items-end gap-2'>
              <span className='text-4xl leading-none font-extrabold'>
                ¥{price}
              </span>
              <span className='mb-1 opacity-85'>/ {t('per person')}</span>
            </div>
            <div className='mt-2 text-base font-medium opacity-95'>
              {t('When {{count}} people join, each gets', { count: maxCount })}{' '}
              <span className='font-bold underline'>
                {formatShare(bestAmount)}
              </span>
            </div>
          </div>
          <div className='flex flex-wrap gap-2 md:max-w-[240px] md:justify-end'>
            <span className='inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-sm'>
              <Zap className='size-4' /> {t('Instant credit')}
            </span>
            <span className='inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-sm'>
              <Users className='size-4' /> {t('Better with more')}
            </span>
            <span className='inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-sm'>
              <Server className='size-4' />{' '}
              {subscriptionReward ? t('Group models') : t('All models')}
            </span>
          </div>
        </div>
      </div>

      {/* Progress + join */}
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-5 lg:items-start'>
        <div className='lg:col-span-3'>
          <Card data-card-hover='false'>
            <CardContent className='p-4 sm:p-5'>
              <div className='flex items-center justify-between'>
                <span className='font-semibold'>{t('Group Progress')}</span>
                <span className='text-muted-foreground text-sm'>
                  {paid}/{cap} {t('people')}
                </span>
              </div>
              <Progress value={percent} className='mt-2 h-2' />
              {detail.status === 'pending' && (
                <p className='text-muted-foreground mt-2 text-sm'>
                  {remaining > 0
                    ? t('{{count}} more to fill the group for the best rate', {
                        count: remaining,
                      })
                    : t('Full, waiting for settlement')}
                </p>
              )}
              <div className='mt-4 flex items-center justify-between'>
                <span className='text-muted-foreground inline-flex items-center gap-1 text-sm'>
                  <CalendarClock className='size-4' /> {t('Ends in')}
                </span>
                <GroupBuyCountdown expireTime={detail.expire_time} size='lg' />
              </div>
              <TierLadder
                tiers={tiers}
                paid={paid}
                currentAmount={currentAmount}
              />
            </CardContent>
          </Card>
        </div>

        <div className='lg:col-span-2'>
          <Card data-card-hover='false'>
            <CardContent className='p-4 sm:p-5'>
              <span className='font-semibold'>{t('Join Group Buy')}</span>
              <div className='mt-3'>
                <JoinPanel
                  detail={detail}
                  currentAmount={currentAmount}
                  canJoin={canJoin}
                  payWay={payWay}
                  onPayWayChange={setPayWay}
                  payOptions={payOptions}
                  submitting={submittingId === detail.group_no}
                  onJoin={() => void join(detail.group_no)}
                  shareLink={shareLink}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Notes + models */}
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        <TitledCard title={t('Group Buy Notes')}>
          <div className='flex flex-col gap-2'>
            {notes.map((note) => (
              <div key={note} className='flex items-start gap-2'>
                <CircleCheck className='text-primary mt-0.5 size-4 shrink-0' />
                <span className='text-muted-foreground text-sm'>{note}</span>
              </div>
            ))}
          </div>
        </TitledCard>
        <TitledCard title={t('Model Access')}>
          <div className='flex items-start gap-2'>
            <Server className='text-primary mt-0.5 size-4 shrink-0' />
            <span className='text-muted-foreground text-sm'>
              {detail.models_hint ||
                (subscriptionReward
                  ? t(
                      'Reward is subscription quota, limited to the bound group models and separate from your wallet.'
                    )
                  : t(
                      'Quota is credited instantly on success and works with all models.'
                    ))}
            </span>
          </div>
          <p className='text-muted-foreground mt-3 text-xs'>
            {t('Deadline')}: {formatTimestampToDate(detail.expire_time)}
          </p>
        </TitledCard>
      </div>

      {/* Members */}
      <TitledCard title={t('Joined Members')}>
        <MembersList participants={detail.participants ?? []} />
      </TitledCard>

      <WechatPayDialog
        open={wechat.open}
        qrCode={wechat.qr}
        tradeNo={wechat.tradeNo}
        onClose={closeWechat}
      />
    </>
  )
}
