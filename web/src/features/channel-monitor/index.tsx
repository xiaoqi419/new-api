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
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RefreshCw } from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

import { getChannelMonitor } from './api'
import { ChannelSection } from './components/channel-section'
import { MonitorDaysToggle } from './components/monitor-days-toggle'
import { MONITOR_DEFAULT_DAYS } from './constants'
import { monitorOverallKey, monitorStatusMeta } from './lib'

const MONITOR_AUTO_REFRESH_MS = 5 * 60 * 1000

export function ChannelMonitor() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [days, setDays] = useState<number>(MONITOR_DEFAULT_DAYS)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['channel-monitor', days],
    queryFn: async () => (await getChannelMonitor(days)).data,
    placeholderData: (prev) => prev,
    refetchInterval: MONITOR_AUTO_REFRESH_MS,
  })
  const channels = data?.channels ?? []

  const handleViewDetail = (channelId: number) => {
    void navigate({
      to: '/channel-monitor/detail',
      search: { channel_id: channelId, days },
    })
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Channel Monitor')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex flex-wrap items-center gap-3'>
              <MonitorDaysToggle
                value={days}
                onChange={setDays}
                disabled={isFetching}
              />
              {data && (
                <StatusBadge
                  label={t(monitorOverallKey(data.overall_status))}
                  variant={monitorStatusMeta(data.overall_status).variant}
                  copyable={false}
                />
              )}
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={`mr-2 size-3.5 ${isFetching ? 'animate-spin' : ''}`}
              />
              {t('Refresh')}
            </Button>
          </div>

          {isLoading && <Skeleton className='h-64 w-full rounded-xl' />}

          {!isLoading && channels.length === 0 && (
            <Empty className='min-h-64 border'>
              <EmptyHeader>
                <EmptyTitle>
                  {t('No request records in the selected time range')}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {!isLoading && channels.length > 0 && (
            <div className='flex flex-col gap-4'>
              {channels.map((channel) => (
                <ChannelSection
                  key={channel.channel_id}
                  item={channel}
                  onViewDetail={handleViewDetail}
                />
              ))}
            </div>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
