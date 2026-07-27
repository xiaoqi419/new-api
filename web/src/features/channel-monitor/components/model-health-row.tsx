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
import { useTranslation } from 'react-i18next'

import { MONITOR_HEALTH_COLORS } from '../constants'
import { formatMonitorTs } from '../lib'
import type { ChannelModelItem } from '../types'
import { HealthHeatmap } from './health-heatmap'

function MetricValue({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <span className='flex items-baseline gap-1'>
      <span className='text-muted-foreground'>{label}</span>
      <span
        className='text-foreground font-medium tabular-nums'
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </span>
  )
}

export function ModelHealthRow({
  item,
  start,
  end,
}: {
  item: ChannelModelItem
  start?: number
  end?: number
}) {
  const { t } = useTranslation()

  const ttft = item.avg_ttft > 0 ? `${item.avg_ttft.toFixed(2)}s` : '-'
  const speed =
    item.throughput > 0 ? `${item.throughput.toFixed(1)} tok/s` : '-'
  const success =
    item.availability >= 0 ? `${item.availability.toFixed(1)}%` : '-'

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <span
          className='size-2 shrink-0 rounded-full'
          style={{ backgroundColor: MONITOR_HEALTH_COLORS[item.status] }}
        />
        <span
          className='text-foreground min-w-0 flex-1 truncate text-sm font-medium'
          title={item.model}
        >
          {item.model}
        </span>
        <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
          {item.request_count} {t('Requests')}
        </span>
      </div>

      <HealthHeatmap buckets={item.buckets} className='h-5' />

      {start != null && end != null && (
        <div className='text-muted-foreground/70 flex justify-between text-[10px]'>
          <span>{formatMonitorTs(start)}</span>
          <span>{formatMonitorTs(end)}</span>
        </div>
      )}

      <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
        <MetricValue label={t('First-token latency')} value={ttft} />
        <MetricValue label={t('Output speed')} value={speed} />
        <MetricValue
          label={t('Success rate')}
          value={success}
          color={
            item.availability >= 0
              ? MONITOR_HEALTH_COLORS[item.status]
              : undefined
          }
        />
      </div>
    </div>
  )
}
