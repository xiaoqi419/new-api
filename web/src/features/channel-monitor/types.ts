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

export type CachePredictionSupport = 'none' | 'low' | 'medium' | 'high'

export type CachePredictionReason =
  | ''
  | 'no_eligible_requests'
  | 'no_cache_evidence'
  | 'too_few_samples'
  | 'insufficient_history'

export interface CachePredictionWindow {
  start: number
  end: number
  seconds: number
}

/**
 * Optional while older servers continue to return the pre-prediction monitor
 * response. Current servers always return this object at channel and model level.
 */
export interface CachePrediction {
  observed_rate: number | null
  predicted_rate: number | null
  sample_count: number
  input_tokens: number
  support: CachePredictionSupport
  observed_window: CachePredictionWindow
  prediction_window: CachePredictionWindow
  forecast_horizon_seconds: number
  insufficient_data: boolean
  reason: CachePredictionReason
}

export interface ChannelModelBucket {
  ts: number
  health: MonitorStatus
  availability: number // -1 when no data
}

/** Empty string means this channel/model pair has not been probed yet. */
export type ProbeVerdict = 'trusted' | 'suspect' | 'unknown' | ''

export interface ProbeEvidence {
  signal: string
  /** `suspect` drives the verdict; `info` is context only. */
  severity: 'suspect' | 'info'
  detail: string
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
  verdict: ProbeVerdict
  reported_model: string
  probed_at: number // 0 when never probed
  evidence: ProbeEvidence[] | null
  cache_prediction?: CachePrediction
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
  suspect_count: number
  cache_prediction?: CachePrediction
}

export interface ChannelMonitorData {
  overall_status: MonitorStatus
  days: number
  start: number
  end: number
  channels: ChannelMonitorItem[]
}
