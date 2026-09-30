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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  RefreshCw,
  Trophy,
} from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  activityLotteryQueryKeys,
  adminCancelActivityLotteryRound,
  adminDrawActivityLotteryRound,
  adminExportActivityLotteryWinners,
  adminGetActivityLotteryRounds,
  adminPublishActivityLotteryRound,
} from './api'
import { ActivityLotteryDraftDrawer } from './components/draft-drawer'
import {
  activityLotteryCurrencyFromCampaign,
  formatActivityPrizeAmount,
} from './lib/money'
import { activityLotteryStatusLabel } from './lib/status'
import { formatShanghaiDrawTime, formatShanghaiStartDate } from './lib/time'
import type { ActivityLotteryCampaign } from './types'

type CampaignAction = {
  type: 'publish' | 'cancel' | 'draw'
  campaign: ActivityLotteryCampaign
}

export function ActivityLotteryAdmin() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [draftEditor, setDraftEditor] = useState<
    ActivityLotteryCampaign | null | undefined
  >()
  const [action, setAction] = useState<CampaignAction | null>(null)
  const query = useQuery({
    queryKey: activityLotteryQueryKeys.admin(page),
    queryFn: () => adminGetActivityLotteryRounds(page),
    placeholderData: (previous) => previous,
  })
  const campaigns = query.data?.items ?? []
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 10))

  const actionMutation = useMutation({
    mutationFn: (selected: CampaignAction) => {
      switch (selected.type) {
        case 'publish':
          return adminPublishActivityLotteryRound(selected.campaign.id)
        case 'cancel':
          return adminCancelActivityLotteryRound(selected.campaign.id)
        case 'draw':
          return adminDrawActivityLotteryRound(selected.campaign.id)
      }
    },
    onSuccess: (_campaign, selected) => {
      if (selected.type === 'publish') toast.success(t('Activity published'))
      if (selected.type === 'cancel') toast.success(t('Activity canceled'))
      if (selected.type === 'draw') toast.success(t('Draw completed'))
      setAction(null)
      void queryClient.invalidateQueries({ queryKey: ['activity-lottery'] })
    },
  })

  const [exportingId, setExportingId] = useState<number | null>(null)
  const handleExport = async (campaign: ActivityLotteryCampaign) => {
    setExportingId(campaign.id)
    try {
      await adminExportActivityLotteryWinners(campaign.id)
      toast.success(t('Winner list downloaded'))
    } catch {
      toast.error(t('Download failed'))
    } finally {
      setExportingId(null)
    }
  }

  let confirmTitle = ''
  let confirmText = ''
  let confirmDescription = ''
  if (action?.type === 'publish') {
    confirmTitle = t('Publish this recharge lottery?')
    confirmText = t('Confirm publication')
    confirmDescription = t(
      'Successful wallet top-ups from the selected start date until the draw time count, including those completed before publication. Rules and prize values are locked after publishing.'
    )
  } else if (action?.type === 'cancel') {
    confirmTitle = t('Cancel this recharge lottery?')
    confirmText = t('Confirm cancellation')
    confirmDescription = t(
      'Canceling ends this activity without issuing activity gifts.'
    )
  } else if (action?.type === 'draw') {
    confirmTitle = t('Run the draw now?')
    confirmText = t('Confirm draw')
    confirmDescription = t(
      'Each winner receives activity gift credit automatically. If too few accounts qualified, no prizes will be issued.'
    )
  }
  const actionPoolAmount =
    action?.campaign.prizes.reduce(
      (sum, prize) => sum + prize.count * prize.amount_cents,
      0
    ) ?? 0
  const actionCurrency = action
    ? activityLotteryCurrencyFromCampaign(action.campaign)
    : undefined
  const actionSlots =
    action?.campaign.prizes.reduce((sum, prize) => sum + prize.count, 0) ?? 0

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Recharge Lottery Management')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            aria-hidden='true'
            className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`}
          />
          {t('Refresh')}
        </Button>
        <Button size='sm' onClick={() => setDraftEditor(null)}>
          <Plus aria-hidden='true' className='size-4' />
          {t('Create activity')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='mx-auto max-w-6xl space-y-5'>
          {query.isPending && (
            <LoadingState message={t('Loading activities...')} />
          )}
          {query.isError && (
            <ErrorState
              title={t('Could not load activities')}
              onRetry={() => void query.refetch()}
            />
          )}
          {query.isSuccess && campaigns.length === 0 && (
            <EmptyState
              icon={Trophy}
              title={t('No recharge lottery rounds yet')}
              description={t(
                'Create a draft, review its prize pool, then publish it when ready.'
              )}
              bordered
            />
          )}
          {query.isSuccess &&
            campaigns.map((campaign) => {
              const slots = campaign.prizes.reduce(
                (sum, prize) => sum + prize.count,
                0
              )
              const poolCents = campaign.prizes.reduce(
                (sum, prize) => sum + prize.count * prize.amount_cents,
                0
              )
              const currency = activityLotteryCurrencyFromCampaign(campaign)
              const canDraw =
                campaign.status === 'open' &&
                Math.floor(Date.now() / 1000) >= campaign.draw_at
              return (
                <Card key={campaign.id} className='gap-4 p-5'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='min-w-0 space-y-1'>
                      <h2 className='text-lg font-semibold break-words'>
                        {campaign.title}
                      </h2>
                      {campaign.description && (
                        <p className='text-muted-foreground line-clamp-2 text-sm'>
                          {campaign.description}
                        </p>
                      )}
                    </div>
                    <div className='flex flex-wrap items-center justify-end gap-2'>
                      {campaign.designated_user_id > 0 && (
                        <Badge variant='outline'>
                          {t('Designated winner #{{id}}', {
                            id: campaign.designated_user_id,
                          })}
                        </Badge>
                      )}
                      <Badge
                        variant={
                          campaign.status === 'open' ? 'warning' : 'secondary'
                        }
                      >
                        {activityLotteryStatusLabel(campaign.status, t)}
                      </Badge>
                    </div>
                  </div>
                  <div className='grid gap-3 border-y py-3 text-sm sm:grid-cols-5'>
                    <div>
                      <p className='text-muted-foreground text-xs'>
                        {t('Start date')}
                      </p>
                      <p className='font-medium'>
                        {formatShanghaiStartDate(
                          campaign.qualification_start_at
                        )}
                      </p>
                    </div>
                    <div>
                      <p className='text-muted-foreground text-xs'>
                        {t('Draw time')}
                      </p>
                      <p className='font-medium'>
                        {formatShanghaiDrawTime(campaign.draw_at)}
                      </p>
                    </div>
                    <div>
                      <p className='text-muted-foreground text-xs'>
                        {t('Prize slots')}
                      </p>
                      <p className='font-medium'>
                        {formatNumber(slots, locale)}
                      </p>
                    </div>
                    <div>
                      <p className='text-muted-foreground text-xs'>
                        {t('Total prize pool')}
                      </p>
                      <p className='font-medium'>
                        {formatActivityPrizeAmount(poolCents, currency, locale)}
                      </p>
                    </div>
                    <div>
                      <p className='text-muted-foreground text-xs'>
                        {t('Participants')}
                      </p>
                      <p className='font-medium'>
                        {formatNumber(campaign.participant_count, locale)}
                      </p>
                    </div>
                  </div>
                  {campaign.status === 'draft' && (
                    <div className='flex flex-wrap gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setDraftEditor(campaign)}
                      >
                        {t('Edit draft')}
                      </Button>
                      <Button
                        size='sm'
                        onClick={() => setAction({ type: 'publish', campaign })}
                      >
                        {t('Publish')}
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setAction({ type: 'cancel', campaign })}
                      >
                        {t('Cancel activity')}
                      </Button>
                    </div>
                  )}
                  {campaign.status === 'open' && (
                    <div className='flex flex-wrap gap-2'>
                      {canDraw && (
                        <Button
                          size='sm'
                          onClick={() => setAction({ type: 'draw', campaign })}
                        >
                          {t('Run draw now')}
                        </Button>
                      )}
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setAction({ type: 'cancel', campaign })}
                      >
                        {t('Cancel activity')}
                      </Button>
                    </div>
                  )}
                  {campaign.status === 'drawn' && (
                    <div className='flex flex-wrap gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={exportingId === campaign.id}
                        onClick={() => void handleExport(campaign)}
                      >
                        <Download aria-hidden='true' className='size-3.5' />
                        {t('Export winner list')}
                      </Button>
                    </div>
                  )}
                </Card>
              )
            })}
          {query.isSuccess && totalPages > 1 && (
            <nav
              className='flex items-center justify-center gap-3'
              aria-label={t('Pagination')}
            >
              <Button
                size='icon'
                variant='outline'
                aria-label={t('Previous')}
                disabled={page === 1 || query.isFetching}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft aria-hidden='true' />
              </Button>
              <span className='text-muted-foreground text-sm'>
                {t('Page {{page}} of {{pages}}', { page, pages: totalPages })}
              </span>
              <Button
                size='icon'
                variant='outline'
                aria-label={t('Next')}
                disabled={page >= totalPages || query.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight aria-hidden='true' />
              </Button>
            </nav>
          )}
        </div>
        <ActivityLotteryDraftDrawer
          open={draftEditor !== undefined}
          campaign={draftEditor ?? undefined}
          onOpenChange={(open) => {
            if (!open) setDraftEditor(undefined)
          }}
        />
        <ConfirmDialog
          open={action !== null}
          onOpenChange={(open) => {
            if (!open) setAction(null)
          }}
          title={confirmTitle}
          desc={
            <div className='space-y-2'>
              <p>{confirmDescription}</p>
              {action && actionCurrency && (
                <div className='bg-muted/40 space-y-1 rounded-lg p-3 text-sm'>
                  <p>
                    {t('Start date')}:{' '}
                    {formatShanghaiStartDate(
                      action.campaign.qualification_start_at
                    )}
                  </p>
                  <p>
                    {t('Draw time')}:{' '}
                    {formatShanghaiDrawTime(action.campaign.draw_at)}
                  </p>
                  <p>
                    {t('Prize slots')}: {formatNumber(actionSlots, locale)}
                  </p>
                  <p className='font-medium'>
                    {t('Total prize pool')}:{' '}
                    {formatActivityPrizeAmount(
                      actionPoolAmount,
                      actionCurrency,
                      locale
                    )}
                  </p>
                </div>
              )}
            </div>
          }
          confirmText={confirmText}
          destructive={action?.type === 'cancel'}
          isLoading={actionMutation.isPending}
          handleConfirm={() => {
            if (action) actionMutation.mutate(action)
          }}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
