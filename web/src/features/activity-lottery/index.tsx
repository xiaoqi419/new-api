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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { ChevronLeft, ChevronRight, Trophy } from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  activityLotteryQueryKeys,
  getActivityLotteryRounds,
  getCurrentActivityLottery,
} from './api'
import { ActivityLotteryBoard } from './components/activity-board'
import { activityLotteryStatusLabel } from './lib/status'
import { formatShanghaiDrawTime } from './lib/time'

export function ActivityLotteryPage() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [page, setPage] = useState(1)
  const currentQuery = useQuery({
    queryKey: activityLotteryQueryKeys.current,
    queryFn: getCurrentActivityLottery,
    refetchInterval: 30_000,
  })
  const roundsQuery = useQuery({
    queryKey: activityLotteryQueryKeys.rounds(page),
    queryFn: () => getActivityLotteryRounds(page),
    placeholderData: (previous) => previous,
  })
  const current = currentQuery.data
  const history = (roundsQuery.data?.items ?? []).filter(
    (campaign) => campaign.id !== current?.campaign.id
  )
  const totalPages = Math.max(1, Math.ceil((roundsQuery.data?.total ?? 0) / 10))
  const noCampaigns =
    currentQuery.isSuccess &&
    roundsQuery.isSuccess &&
    !current &&
    roundsQuery.data?.total === 0

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Recharge Lottery')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto max-w-6xl space-y-10'>
          {currentQuery.isPending && (
            <LoadingState message={t('Loading recharge lottery...')} />
          )}
          {currentQuery.isError && (
            <ErrorState
              title={t('Could not load the recharge lottery')}
              onRetry={() => void currentQuery.refetch()}
            />
          )}
          {current && <ActivityLotteryBoard view={current} />}

          {noCampaigns && (
            <EmptyState
              icon={Trophy}
              title={t('No recharge lottery has been published yet')}
              description={t(
                'When an activity opens, its rules and draw time will appear here.'
              )}
              bordered
            />
          )}

          {roundsQuery.isError && (
            <ErrorState
              title={t('Could not load past draws')}
              onRetry={() => void roundsQuery.refetch()}
            />
          )}
          {!roundsQuery.isError && history.length > 0 && (
            <section className='space-y-4'>
              <div className='flex items-center justify-between gap-3'>
                <h2 className='text-xl font-semibold'>{t('Past draws')}</h2>
                {roundsQuery.isFetching && (
                  <span className='text-muted-foreground text-xs'>
                    {t('Refreshing...')}
                  </span>
                )}
              </div>
              <div className='grid gap-3 md:grid-cols-2'>
                {history.map((campaign) => (
                  <Card key={campaign.id} className='gap-3 p-5'>
                    <div className='flex items-center justify-between gap-3'>
                      <Badge variant='secondary'>
                        {activityLotteryStatusLabel(campaign.status, t)}
                      </Badge>
                      <time
                        className='text-muted-foreground text-xs'
                        dateTime={new Date(
                          campaign.draw_at * 1000
                        ).toISOString()}
                      >
                        {formatShanghaiDrawTime(campaign.draw_at)}
                      </time>
                    </div>
                    <h3 className='text-base font-semibold'>
                      <Link
                        to='/activity-lottery/$id'
                        params={{ id: String(campaign.id) }}
                        className='hover:text-primary transition-colors'
                      >
                        {campaign.title}
                      </Link>
                    </h3>
                    <p className='text-muted-foreground text-sm'>
                      {t('Prize slots')}:{' '}
                      {formatNumber(
                        campaign.prizes.reduce(
                          (sum, prize) => sum + prize.count,
                          0
                        ),
                        locale
                      )}
                    </p>
                  </Card>
                ))}
              </div>
            </section>
          )}
          {!roundsQuery.isError && totalPages > 1 && (
            <nav
              className='flex items-center justify-center gap-3'
              aria-label={t('Pagination')}
            >
              <Button
                size='icon'
                variant='outline'
                aria-label={t('Previous')}
                disabled={page === 1 || roundsQuery.isFetching}
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
                disabled={page >= totalPages || roundsQuery.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight aria-hidden='true' />
              </Button>
            </nav>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
