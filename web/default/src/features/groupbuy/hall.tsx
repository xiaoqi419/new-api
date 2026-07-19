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
import { useNavigate } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

import { GroupBuyLaunchCard } from './components/group-buy-launch-card'
import { HallCard } from './components/hall-card'
import { useGroupBuyHall } from './hooks/use-group-buy-hall'

export function GroupBuyHall() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { loading, enabled, items, page, total, pageSize, load } =
    useGroupBuyHall()

  const goDetail = (groupNo: string) =>
    navigate({ to: '/groupbuy/detail', search: { no: groupNo } })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Group Buy Hall')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-6xl flex-col gap-4'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'The more people who join, the more quota everyone receives. Invite friends to team up!'
              )}
            </p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => load(page)}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-2 size-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              {t('Refresh')}
            </Button>
          </div>

          <GroupBuyLaunchCard />

          {!enabled && (
            <Alert>
              <AlertDescription>
                {t('Group buy top-up is not enabled by the administrator')}
              </AlertDescription>
            </Alert>
          )}

          {enabled && loading && (
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {['a', 'b', 'c'].map((key) => (
                <Skeleton key={key} className='h-64 w-full rounded-xl' />
              ))}
            </div>
          )}

          {enabled && !loading && items.length === 0 && (
            <Empty className='min-h-64 border'>
              <EmptyHeader>
                <EmptyTitle>{t('No active group buys')}</EmptyTitle>
                <EmptyDescription>
                  {t('Start a new group buy above')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {enabled && !loading && items.length > 0 && (
            <>
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                {items.map((item) => (
                  <HallCard key={item.group_no} item={item} onOpen={goDetail} />
                ))}
              </div>
              {total > pageSize && (
                <div className='flex items-center justify-center gap-3'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page <= 1 || loading}
                    onClick={() => load(page - 1)}
                  >
                    {t('Previous')}
                  </Button>
                  <span className='text-muted-foreground text-sm'>
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page >= totalPages || loading}
                    onClick={() => load(page + 1)}
                  >
                    {t('Next')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
