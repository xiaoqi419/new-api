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

import { cn } from '@/lib/utils'

import { MONITOR_HEALTH_COLORS } from '../constants'
import { formatMonitorTs } from '../lib'
import type { ChannelModelBucket } from '../types'

export function HealthHeatmap({
  buckets,
  className,
}: {
  buckets: ChannelModelBucket[]
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex h-6 w-full items-stretch gap-px overflow-hidden rounded',
        className
      )}
    >
      {buckets.map((b) => {
        const tooltip =
          b.availability >= 0
            ? `${formatMonitorTs(b.ts)}  ${t('Availability')} ${b.availability.toFixed(1)}%`
            : `${formatMonitorTs(b.ts)}  ${t('No data')}`
        return (
          <div
            key={b.ts}
            title={tooltip}
            className={cn(
              'min-w-0 flex-1',
              b.health === 'nodata' && 'bg-muted'
            )}
            style={
              b.health === 'nodata'
                ? undefined
                : { backgroundColor: MONITOR_HEALTH_COLORS[b.health] }
            }
          />
        )
      })}
    </div>
  )
}
