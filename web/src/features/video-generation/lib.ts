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

import type {
  ContentItem,
  VideoFormState,
  VideoMode,
  VideoSubmitBody,
} from './types'

export function isSuccessStatus(status?: string): boolean {
  return (status || '').toUpperCase() === 'SUCCESS'
}

export function isFailStatus(status?: string): boolean {
  return (status || '').toUpperCase().includes('FAIL')
}

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

function pushContent(
  items: ContentItem[],
  url: string,
  type: ContentItem['type'],
  role: string
): void {
  const u = (url || '').trim()
  if (!u) return
  const item: ContentItem = { type, role }
  if (type === 'image_url') item.image_url = { url: u }
  else if (type === 'video_url') item.video_url = { url: u }
  else item.audio_url = { url: u }
  items.push(item)
}

export function buildContent(
  mode: VideoMode,
  form: VideoFormState
): ContentItem[] {
  const items: ContentItem[] = []
  if (mode === 'first' || mode === 'firstlast') {
    pushContent(items, form.firstFrame, 'image_url', 'first_frame')
  }
  if (mode === 'firstlast') {
    pushContent(items, form.lastFrame, 'image_url', 'last_frame')
  }
  if (mode === 'reference') {
    form.refImages.forEach((u) =>
      pushContent(items, u, 'image_url', 'reference_image')
    )
    form.refVideos.forEach((u) =>
      pushContent(items, u, 'video_url', 'reference_video')
    )
    form.refAudios.forEach((u) =>
      pushContent(items, u, 'audio_url', 'reference_audio')
    )
  }
  return items
}

export function buildBody(config: {
  model: string
  prompt: string
  duration: number
  resolution: string
  ratio: string
  generateAudio: boolean
  watermark: boolean
  mode: VideoMode
  form: VideoFormState
}): VideoSubmitBody {
  const body: VideoSubmitBody = {
    model: config.model,
    prompt: config.prompt.trim(),
    seconds: String(config.duration),
    metadata: {
      resolution: config.resolution,
      ratio: config.ratio,
      generate_audio: config.generateAudio,
      watermark: config.watermark,
    },
  }
  const content = buildContent(config.mode, config.form)
  if (content.length > 0) body.metadata.content = content
  return body
}
