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
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { ArrowLeft } from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'

import { activityLotteryQueryKeys, getActivityLotteryRound } from './api'
import { ActivityLotteryBoard } from './components/activity-board'

type Props = { roundId: number | null }

export function ActivityLotteryDetail(props: Props) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: activityLotteryQueryKeys.round(props.roundId ?? 0),
    queryFn: () => {
      if (props.roundId === null) {
        throw new Error('Invalid activity lottery round ID')
      }
      return getActivityLotteryRound(props.roundId)
    },
    enabled: props.roundId !== null,
    refetchInterval: props.roundId === null ? false : 30_000,
  })

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Recharge Lottery')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          render={<Link to='/activity-lottery' />}
          variant='outline'
          size='sm'
        >
          <ArrowLeft aria-hidden='true' className='size-4' />
          {t('All draws')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='mx-auto max-w-6xl'>
          {props.roundId === null && (
            <EmptyState title={t('Draw not found')} bordered />
          )}
          {props.roundId !== null && query.isPending && <LoadingState />}
          {props.roundId !== null && query.isError && (
            <ErrorState
              title={t('Could not load this draw')}
              onRetry={() => void query.refetch()}
            />
          )}
          {query.data && <ActivityLotteryBoard view={query.data} />}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
