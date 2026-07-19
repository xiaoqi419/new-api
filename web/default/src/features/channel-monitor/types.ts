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
export interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
}

export type MonitorStatus = 'normal' | 'degraded' | 'abnormal' | 'nodata'

export interface ChannelModelBucket {
  ts: number
  health: MonitorStatus
  availability: number // -1 when no data
}

export interface ChannelModelItem {
  model: string
  status: MonitorStatus
  availability: number // -1 when no data
  avg_ttft: number // seconds, 0 when n/a
  avg_latency: number // seconds
  throughput: number // completion tokens / second
  request_count: number
  buckets: ChannelModelBucket[]
}

export interface ChannelMonitorItem {
  channel_id: number
  name: string
  type: number
  tag: string
  status: MonitorStatus
  availability: number // -1 when no data
  request_count: number
  models: ChannelModelItem[]
}

export interface ChannelMonitorData {
  overall_status: MonitorStatus
  days: number
  start: number
  end: number
  channels: ChannelMonitorItem[]
}
