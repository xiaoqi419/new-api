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

import { api, getUserModels } from '@/lib/api'

import type {
  ImageGenerationResponse,
  ImageSubmitBody,
  SelectOption,
  TokenListItem,
} from './types'

// Load the user's active API keys as `sk-` options for the image relay.
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

// Load the models the user can access as picker options.
export async function loadModelOptions(): Promise<SelectOption[]> {
  const res = await getUserModels()
  const list = res?.data ?? []
  return list.map((m) => ({ label: m, value: m }))
}

export async function submitImage(
  apiKey: string,
  body: ImageSubmitBody
): Promise<ImageGenerationResponse> {
  const res = await axios.post('/v1/images/generations', body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  return (res.data ?? {}) as ImageGenerationResponse
}
