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
import type { StatusVariant } from '@/components/status-badge'

import type { MonitorStatus } from './types'

export function monitorStatusMeta(status: MonitorStatus): {
  key: string
  variant: StatusVariant
} {
  switch (status) {
    case 'normal':
      return { key: 'Healthy', variant: 'success' }
    case 'degraded':
      return { key: 'Degraded', variant: 'warning' }
    case 'abnormal':
      return { key: 'Abnormal', variant: 'danger' }
    case 'nodata':
    default:
      return { key: 'No data', variant: 'neutral' }
  }
}

export function monitorOverallKey(status: MonitorStatus): string {
  switch (status) {
    case 'normal':
      return 'Operating normally'
    case 'degraded':
      return 'Partially degraded'
    case 'abnormal':
      return 'Issues detected'
    case 'nodata':
    default:
      return 'No data yet'
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function formatMonitorTs(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
