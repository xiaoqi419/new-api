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
import { TASK_ACTIONS, TASK_PLATFORMS } from '../constants'
import type { TaskImageResult, TaskLog } from '../types'

const IMAGE_ACTIONS = new Set<string>([
  TASK_ACTIONS.IMAGES_GENERATION,
  TASK_ACTIONS.IMAGES_EDIT,
])

const VIDEO_ACTIONS = new Set<string>([
  TASK_ACTIONS.GENERATE,
  TASK_ACTIONS.TEXT_GENERATE,
  TASK_ACTIONS.FIRST_TAIL_GENERATE,
  TASK_ACTIONS.REFERENCE_GENERATE,
  TASK_ACTIONS.REMIX_GENERATE,
])

function parseArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (typeof data !== 'string') return []

  try {
    const parsed: unknown = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function isFirstPartyImageUrl(value: string): boolean {
  return value.startsWith('/api/drawing_logs/image/')
}

export function isImageTask(log: TaskLog): boolean {
  return log.platform === TASK_PLATFORMS.IMAGE && IMAGE_ACTIONS.has(log.action)
}

export function isVideoTask(log: TaskLog): boolean {
  return !isImageTask(log) && VIDEO_ACTIONS.has(log.action)
}

export function getTaskImageResults(log: TaskLog): TaskImageResult[] {
  if (!isImageTask(log)) return []

  return parseArray(log.data).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { status: 'unavailable' }
    }

    const record = item as Record<string, unknown>
    const status = readString(record, 'status')
    const errorCode = readString(record, 'error_code')
    const key = readString(record, 'key')
    const thumbnailUrl = readString(record, 'thumbnail_url')
    const originalUrl = readString(record, 'original_url')
    if (status === 'unavailable') {
      return {
        status: 'unavailable',
        ...(errorCode ? { error_code: errorCode } : {}),
      }
    }
    if (
      (status && status !== 'available') ||
      !key ||
      !isFirstPartyImageUrl(thumbnailUrl) ||
      !isFirstPartyImageUrl(originalUrl)
    ) {
      return { status: 'unavailable' }
    }

    return {
      status: 'available',
      key,
      thumbnail_url: thumbnailUrl,
      original_url: originalUrl,
    }
  })
}
