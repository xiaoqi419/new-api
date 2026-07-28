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
import type { AxiosError } from 'axios'

import { IMAGE_MODEL_HINTS } from './constants'
import type { ImageGenerationResponse, ImageSubmitBody } from './types'

export function extractError(e: unknown): string {
  const err = e as AxiosError<{
    error?: { message?: string }
    message?: string
  }>
  const d = err.response?.data
  if (d?.error?.message) return d.error.message
  if (d?.message) {
    try {
      const inner = JSON.parse(d.message) as { error?: { message?: string } }
      if (inner?.error?.message) return inner.error.message
    } catch {
      /* message is not JSON, return as-is */
    }
    return d.message
  }
  return err.message || 'Request failed'
}

export function buildBody(config: {
  model: string
  prompt: string
  n: number
  size: string
  quality: string
}): ImageSubmitBody {
  const body: ImageSubmitBody = {
    model: config.model,
    prompt: config.prompt.trim(),
    n: config.n,
    size: config.size,
  }
  if (config.quality && config.quality !== 'default') {
    body.quality = config.quality
  }
  return body
}

// Parse an OpenAI-compatible images response into displayable image sources,
// supporting both hosted URLs and inline base64 payloads.
export function parseImages(res: ImageGenerationResponse): string[] {
  const items = res.data ?? []
  const out: string[] = []
  for (const it of items) {
    if (it.url) {
      out.push(it.url)
    } else if (it.b64_json) {
      out.push(`data:image/png;base64,${it.b64_json}`)
    }
  }
  return out
}

// Pick a reasonable default model: the first one whose name looks image-related,
// otherwise the first model available to the user.
export function pickDefaultModel(models: string[]): string {
  if (models.length === 0) return ''
  const hinted = models.find((m) =>
    IMAGE_MODEL_HINTS.some((h) => m.toLowerCase().includes(h))
  )
  return hinted ?? models[0]
}
