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

import { Loader2, RefreshCw } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { getUserDrawingLogs } from '@/features/usage-logs/api'
import type { DrawingLog } from '@/features/usage-logs/types'
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'

import { IMAGE_RECORDS_QUERY_KEY, RECORDS_PAGE_SIZE } from '../constants'

function parseResultKeys(raw?: string): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function toImageSrc(entry: string): string {
  if (entry.startsWith('http://') || entry.startsWith('https://')) {
    return entry
  }
  return `/api/drawing_logs/image/${entry}`
}

export function ImageRecords() {
  const { t } = useTranslation()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: IMAGE_RECORDS_QUERY_KEY,
    queryFn: () => getUserDrawingLogs({ p: 1, page_size: RECORDS_PAGE_SIZE }),
  })

  const logs = (data?.data?.items ?? []) as DrawingLog[]

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
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
          {logs.map((log) => {
            const keys = parseResultKeys(log.result_urls)
            const src = keys.length > 0 ? toImageSrc(keys[0]) : ''
            return (
              <div
                key={log.id}
                className='border-border/60 flex flex-col overflow-hidden rounded-lg border'
              >
                {src ? (
                  <button
                    type='button'
                    className='group bg-muted/30 aspect-square w-full'
                    onClick={() => window.open(src, '_blank')}
                    title={t('Click to view image')}
                  >
                    <img
                      src={src}
                      alt={log.prompt || t('Image')}
                      loading='lazy'
                      className='h-full w-full object-cover transition group-hover:opacity-80'
                    />
                  </button>
                ) : (
                  <div className='bg-muted/30 text-muted-foreground/60 flex aspect-square w-full items-center justify-center text-xs'>
                    {log.status || '-'}
                  </div>
                )}
                <div className='flex flex-col gap-1 p-2'>
                  <span
                    className='truncate font-mono text-[11px]'
                    title={log.model_name}
                  >
                    {log.model_name || '-'}
                  </span>
                  {log.prompt && (
                    <span
                      className='text-muted-foreground line-clamp-2 text-xs'
                      title={log.prompt}
                    >
                      {log.prompt}
                    </span>
                  )}
                  <div className='text-muted-foreground/70 flex items-center justify-between text-[10px] tabular-nums'>
                    <span>
                      {formatTimestampToDate(log.created_at, 'seconds')}
                    </span>
                    <span>{formatLogQuota(log.quota)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
