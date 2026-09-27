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

const PELICAN_LIST_TIMEOUT_MS = 12_000

export interface PelicanGroup {
  id: number
  name: string
}

export interface PelicanRun {
  id: number
  started_at: number
  status: string
  request_model?: string
  duration_seconds?: number
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  error?: string
  subject_key?: string
  title?: string
  prompt?: string
  groups?: PelicanGroup[]
  preview_url?: string
}

export interface PelicanRunsPayload {
  runs: PelicanRun[]
  limit?: number
}

interface PelicanRunsResponse {
  success: boolean
  message?: string
  data?: PelicanRunsPayload
}

export async function getPelicanRuns(
  signal: AbortSignal
): Promise<PelicanRunsPayload> {
  const response = await api.get<PelicanRunsResponse>('/api/pelican/runs', {
    signal,
    skipErrorHandler: true,
    disableDuplicate: true,
  })
  const data = requireServerSuccess(response.data).data
  if (!data || !Array.isArray(data.runs)) {
    throw new Error('pelican gallery unavailable')
  }
  return data
}

export function fetchPelicanRuns(
  signal: AbortSignal
): Promise<PelicanRunsPayload> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PELICAN_LIST_TIMEOUT_MS)
  const abort = () => controller.abort()
  if (signal.aborted) {
    abort()
  } else {
    signal.addEventListener('abort', abort, { once: true })
  }
  return getPelicanRuns(controller.signal).finally(() => {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  })
}
