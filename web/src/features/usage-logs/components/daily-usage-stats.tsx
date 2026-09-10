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
import { useTranslation } from 'react-i18next'

import { formatTokens } from '@/lib/format'

import { useDailyUsageSummary } from '../hooks/use-daily-usage-summary'
import { useUsageLogsContext } from './usage-logs-provider'

function StatBadge(props: { label: string; value: string; accent: string }) {
  return (
    <span className='border-border/60 bg-muted/25 inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-1 text-xs shadow-xs'>
      <span className={`h-3.5 w-0.5 shrink-0 rounded-full ${props.accent}`} />
      <span className='text-muted-foreground whitespace-nowrap'>
        {props.label}
      </span>
      <span className='text-foreground/85 min-w-0 truncate font-mono font-semibold tabular-nums'>
        {props.value}
      </span>
    </span>
  )
}

function formatCacheRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '--'
  return `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`
}

export function DailyUsageStats() {
  const { t } = useTranslation()
  const { sensitiveVisible } = useUsageLogsContext()
  const { data, isLoading, isError } = useDailyUsageSummary()

  if (isLoading) {
    return (
      <div className='flex flex-wrap items-center gap-2' aria-busy='true'>
        <span className='bg-muted h-7 w-28 animate-pulse rounded-md' />
        <span className='bg-muted h-7 w-24 animate-pulse rounded-md' />
      </div>
    )
  }

  const unavailable = isError || !data
  const totalTokens = unavailable ? '--' : formatTokens(data.total_tokens)
  const cacheRate = unavailable ? '--' : formatCacheRate(data.cache_rate)

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-2'>
      <StatBadge
        label={t('Cache Rate')}
        value={sensitiveVisible ? cacheRate : '••••'}
        accent='bg-success/70'
      />
      <StatBadge
        label={t('Total Usage')}
        value={sensitiveVisible ? totalTokens : '••••'}
        accent='bg-info/70'
      />
    </div>
  )
}
