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
import type { PerformanceGroup } from '@/features/performance-metrics/types'

import type { UptimeDayPoint } from './mock-stats'

export function toUptimePct(value: number): number {
  if (!Number.isFinite(value)) return 0
  const clamped = Math.min(100, Math.max(0, value))
  return Math.round(clamped * 100) / 100
}

export function toGroupUptimeSeries(group: PerformanceGroup): UptimeDayPoint[] {
  return group.series.map((point) => {
    const successRate = toUptimePct(point.success_rate)
    return {
      date: new Date(point.ts * 1000).toISOString(),
      uptime_pct: successRate,
      incidents: successRate < 100 ? 1 : 0,
      outage_minutes: 0,
    }
  })
}
