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
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

import { getChannelMonitor } from './api'
import { ChannelSection } from './components/channel-section'
import { MonitorDaysToggle } from './components/monitor-days-toggle'
import { monitorStatusMeta } from './lib'

interface ChannelMonitorDetailProps {
  channelId: number
  initialDays: number
}

export function ChannelMonitorDetail({
  channelId,
  initialDays,
}: ChannelMonitorDetailProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [days, setDays] = useState<number>(initialDays)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['channel-monitor', days],
    queryFn: async () => (await getChannelMonitor(days)).data,
    placeholderData: (prev) => prev,
  })

  const channel = data?.channels.find((c) => c.channel_id === channelId)

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {channel?.name || `#${channelId}` || t('Channel Monitor')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void navigate({ to: '/channel-monitor' })}
              >
                <ArrowLeft className='mr-2 size-3.5' />
                {t('Back')}
              </Button>
              {channel && (
                <StatusBadge
                  label={t(monitorStatusMeta(channel.status).key)}
                  variant={monitorStatusMeta(channel.status).variant}
                  copyable={false}
                />
              )}
            </div>
            <div className='flex items-center gap-3'>
              <MonitorDaysToggle
                value={days}
                onChange={setDays}
                disabled={isFetching}
              />
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
          </div>

          {isLoading && <Skeleton className='h-64 w-full rounded-xl' />}

          {!isLoading && !channel && (
            <Empty className='min-h-64 border'>
              <EmptyHeader>
                <EmptyTitle>
                  {t('No request records in the selected time range')}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {!isLoading && channel && (
            <ChannelSection
              item={channel}
              start={data?.start}
              end={data?.end}
              showRange
            />
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
