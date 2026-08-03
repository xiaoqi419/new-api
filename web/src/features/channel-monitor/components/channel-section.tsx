import { useTranslation } from 'react-i18next'

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
import { ChevronRight, ShieldAlert } from '@/components/icons'
import { StatusBadge } from '@/components/status-badge'

import { MONITOR_HEALTH_COLORS } from '../constants'
import { monitorStatusMeta } from '../lib'
import type { ChannelMonitorItem } from '../types'
import { ModelHealthRow } from './model-health-row'

interface ChannelSectionProps {
  item: ChannelMonitorItem
  start?: number
  end?: number
  showRange?: boolean
  onViewDetail?: (channelId: number) => void
}

export function ChannelSection({
  item,
  start,
  end,
  showRange,
  onViewDetail,
}: ChannelSectionProps) {
  const { t } = useTranslation()
  const meta = monitorStatusMeta(item.status)

  return (
    <div className='flex flex-col gap-3 rounded-2xl border p-4 shadow-sm'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className='size-2.5 shrink-0 rounded-full'
            style={{ backgroundColor: MONITOR_HEALTH_COLORS[item.status] }}
          />
          <span className='truncate font-semibold' title={item.name}>
            {item.name}
          </span>
          {item.tag && (
            <span className='bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs'>
              {item.tag}
            </span>
          )}
        </div>
        <div className='flex shrink-0 items-center gap-3'>
          {item.suspect_count > 0 && (
            <span
              className='text-destructive flex shrink-0 items-center gap-1 text-xs font-medium'
              title={t('Models suspected of not matching what they claim')}
            >
              <ShieldAlert className='size-3.5' />
              {t('{{count}} suspect model(s)', { count: item.suspect_count })}
            </span>
          )}
          <span className='text-muted-foreground hidden text-xs tabular-nums sm:inline'>
            {item.request_count} {t('Requests')}
          </span>
          <StatusBadge
            label={t(meta.key)}
            variant={meta.variant}
            copyable={false}
          />
          {onViewDetail && (
            <button
              type='button'
              onClick={() => onViewDetail(item.channel_id)}
              className='text-muted-foreground hover:text-primary flex items-center gap-1 text-sm'
            >
              <span className='hidden sm:inline'>{t('View details')}</span>
              <ChevronRight className='size-4' />
            </button>
          )}
        </div>
      </div>

      <div className='grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2'>
        {item.models.map((m) => (
          <ModelHealthRow
            key={m.model}
            item={m}
            start={showRange ? start : undefined}
            end={showRange ? end : undefined}
          />
        ))}
      </div>
    </div>
  )
}
