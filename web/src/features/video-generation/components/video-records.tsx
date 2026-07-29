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
import { useTranslation } from 'react-i18next'

import { ExternalLink, Loader2, RefreshCw } from '@/components/icons'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { getUserTaskLogs } from '@/features/usage-logs/api'
import type { TaskLog } from '@/features/usage-logs/types'
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'

import { VIDEO_RECORDS_PAGE_SIZE, VIDEO_RECORDS_QUERY_KEY } from '../constants'

function statusVariant(
  status: string
): 'success' | 'danger' | 'warning' | 'neutral' {
  switch ((status || '').toUpperCase()) {
    case 'SUCCESS':
      return 'success'
    case 'FAILURE':
    case 'FAILED':
      return 'danger'
    case 'IN_PROGRESS':
    case 'SUBMITTED':
    case 'QUEUED':
    case 'NOT_START':
      return 'warning'
    default:
      return 'neutral'
  }
}

function modelName(log: TaskLog): string {
  return (
    log.properties?.origin_model_name ||
    log.properties?.upstream_model_name ||
    log.platform ||
    '-'
  )
}

export function VideoRecords() {
  const { t } = useTranslation()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: VIDEO_RECORDS_QUERY_KEY,
    queryFn: () =>
      getUserTaskLogs({ p: 1, page_size: VIDEO_RECORDS_PAGE_SIZE }),
  })

  const logs = (data?.data?.items ?? []) as TaskLog[]

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-end'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`mr-1 size-3.5 ${isFetching ? 'animate-spin' : ''}`}
          />
          {t('Refresh')}
        </Button>
      </div>

      {isLoading && (
        <div className='flex items-center justify-center py-8'>
          <Loader2 className='text-muted-foreground size-6 animate-spin' />
        </div>
      )}

      {!isLoading && logs.length === 0 && (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          {t('No records yet')}
        </p>
      )}

      {logs.length > 0 && (
        <div className='flex flex-col divide-y'>
          {logs.map((log) => (
            <div key={log.id} className='flex items-center gap-3 py-2 text-sm'>
              <StatusBadge
                label={log.status || '-'}
                variant={statusVariant(log.status)}
                size='sm'
                copyable={false}
              />
              <span
                className='max-w-[200px] truncate font-mono text-xs'
                title={modelName(log)}
              >
                {modelName(log)}
              </span>
              <span className='text-muted-foreground shrink-0 font-mono text-xs tabular-nums'>
                {formatTimestampToDate(log.submit_time, 'seconds')}
              </span>
              <span className='text-muted-foreground shrink-0 font-mono text-xs tabular-nums'>
                {formatLogQuota(log.quota ?? 0)}
              </span>
              <div className='ml-auto shrink-0'>
                {log.result_url ? (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => window.open(log.result_url, '_blank')}
                  >
                    <ExternalLink className='mr-1 size-3.5' />
                    {t('View')}
                  </Button>
                ) : (
                  <span className='text-muted-foreground/60 text-xs'>-</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
