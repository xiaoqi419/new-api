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
import axios from 'axios'

import { api } from '@/lib/api'

import type {
  SelectOption,
  TokenListItem,
  VideoSubmitBody,
  VideoTaskData,
} from './types'

// Load the user's active API keys as `sk-` options for the video relay.
export async function loadTokenOptions(): Promise<SelectOption[]> {
  const res = await api.get('/api/token/?p=1&size=100')
  const body = res.data
  if (!body?.success) {
    throw new Error(body?.message || 'Failed to load tokens')
  }
  const data = body.data
  const items: TokenListItem[] = Array.isArray(data)
    ? data
    : (data?.items ?? [])
  const active = items.filter((tk) => tk.status === 1)

  const options: SelectOption[] = []
  for (const tk of active) {
    try {
      const keyRes = await api.post(`/api/token/${tk.id}/key`)
      const key = keyRes.data?.data?.key as string | undefined
      if (!key) continue
      options.push({
        label: `${tk.name || `#${tk.id}`} (sk-${key.slice(0, 6)}…)`,
        value: `sk-${key}`,
      })
    } catch {
      /* skip tokens whose key cannot be fetched */
    }
  }
  return options
}

// Load ready-to-use assets from the private asset library as asset:// options.
export async function loadAssetOptions(): Promise<SelectOption[]> {
  try {
    const res = await api.get('/api/ark_asset')
    const body = res.data
    if (!body?.success) return []
    const assets = (body.data ?? []) as Array<{
      name?: string
      asset_id: string
      status: string
    }>
    return assets
      .filter((a) => a.status === 'Active')
      .map((a) => ({
        label: `${a.name || a.asset_id} (asset://${a.asset_id})`,
        value: `asset://${a.asset_id}`,
      }))
  } catch {
    return []
  }
}

export async function submitVideo(
  apiKey: string,
  body: VideoSubmitBody
): Promise<{ task_id?: string; id?: string }> {
  const res = await axios.post('/v1/video/generations', body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  return res.data ?? {}
}

export async function pollVideoTask(
  apiKey: string,
  taskId: string
): Promise<VideoTaskData> {
  const res = await axios.get(`/v1/video/generations/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  return (res.data?.data ?? {}) as VideoTaskData
}
