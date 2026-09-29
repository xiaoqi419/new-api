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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

const MONITOR_TIMEOUT_MS = 12_000

export type PelicanWindow = '24h' | '3d'
export type PelicanHealth = 'normal' | 'degraded' | 'empty'
export type PelicanSlotStatus = 'pass' | 'fail' | 'error' | 'running' | 'empty'

export interface PelicanSlot {
  start: number
  status: PelicanSlotStatus | string
  id?: number
}

export interface PelicanBrief {
  id: number
  status: string
  slot_start: number
  created_at: number
  latency_ms: number
  vehicle?: string
  scene?: string
  subject?: string
}

export interface PelicanPanel {
  passed: number
  judged: number
  avg_latency_ms: number
  latest: PelicanBrief | null
  slots: PelicanSlot[]
}

export interface PelicanArtwork {
  id: number
  html: string
  subject: string
  vehicle: string
  scene: string
  slot_start: number
  latency_ms: number
}

export interface PelicanGroupCard {
  name: string
  description: string
  model: string
  reasoning: string
  ratio: number
  has_key: boolean
  health: PelicanHealth | string
  logic: PelicanPanel
  drawing: PelicanPanel
  artwork: PelicanArtwork | null
}

export interface PelicanGroupChoice {
  group: string
  model?: string
}

export interface PelicanCatalogGroup {
  name: string
  models: string[]
}

export interface PelicanSettings {
  enabled: boolean
  groups: Array<string | PelicanGroupChoice>
  catalog?: PelicanCatalogGroup[]
  logic_prompt: string
  logic_prompt_default: string
  logic_answer: string
  logic_answer_default: string
  drawing_prompt: string
  drawing_prompt_default: string
}

export interface PelicanDashboard {
  updated_at: number
  range: PelicanWindow
  next_slot_at: number
  logic_pass_rate: number | null
  enabled: boolean
  logic_answer: string
  settings?: PelicanSettings
  summary: { normal: number; degraded: number; empty: number }
  groups: PelicanGroupCard[]
}

export interface PelicanProbeDetail {
  id: number
  group_name: string
  kind: string
  status: string
  slot_start: number
  created_at: number
  model: string
  reasoning: string
  latency_ms: number
  ttft_ms: number
  input_tokens: number
  output_tokens: number
  attempts: number
  answer: string
  expected: string
  prompt: string
  reply: string
  drawing_html: string
  subject: string
  vehicle: string
  scene: string
  error: string
}

interface MonitorResponse {
  success: boolean
  message?: string
  data?: PelicanDashboard
}

interface ProbeResponse {
  success: boolean
  message?: string
  data?: PelicanProbeDetail
}

async function withTimeout<T>(
  signal: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MONITOR_TIMEOUT_MS)
  const abort = () => controller.abort()
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export function fetchPelicanMonitor(range: PelicanWindow, signal: AbortSignal) {
  return withTimeout(signal, async (inner) => {
    const response = await api.get<MonitorResponse>('/api/pelican/monitor', {
      signal: inner,
      params: { range },
      skipErrorHandler: true,
      disableDuplicate: true,
    })
    const data = requireServerSuccess(response.data).data
    if (!data || !Array.isArray(data.groups)) {
      throw new Error('pelican monitor unavailable')
    }
    return data
  })
}

export function fetchPelicanProbe(id: number, signal: AbortSignal) {
  return withTimeout(signal, async (inner) => {
    const response = await api.get<ProbeResponse>(
      `/api/pelican/monitor/probes/${id}`,
      { signal: inner, skipErrorHandler: true, disableDuplicate: true }
    )
    const data = requireServerSuccess(response.data).data
    if (!data || data.id !== id) throw new Error('probe not found')
    return data
  })
}

export async function fetchMonitorGroups(signal: AbortSignal) {
  const response = await api.get<{
    success: boolean
    message?: string
    data?: string[]
  }>('/api/group/', { signal, skipErrorHandler: true, disableDuplicate: true })
  const data = requireServerSuccess(response.data).data
  if (!Array.isArray(data)) throw new Error('groups unavailable')
  return [...data].sort((left, right) => left.localeCompare(right))
}
