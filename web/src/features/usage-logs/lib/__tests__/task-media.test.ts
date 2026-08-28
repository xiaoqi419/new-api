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
import { describe, expect, test } from 'vitest'

import type { TaskLog } from '../../types'
import { getTaskImageResults } from '../task-media'

function createImageTask(data: unknown, resultUrl?: string): TaskLog {
  return {
    id: 1,
    user_id: 7,
    platform: 'image',
    task_id: 'task-image-parser',
    action: 'images_generation',
    channel_id: 3,
    submit_time: 1_787_882_400,
    status: 'SUCCESS',
    data,
    result_url: resultUrl,
  }
}

describe('task image result parsing', () => {
  test('mixed capture metadata preserves unavailable slots in original order', () => {
    const log = createImageTask([
      {
        status: 'available',
        key: 'first',
        thumbnail_url: '/api/drawing_logs/image/first',
        original_url: '/api/drawing_logs/image/first?variant=original',
      },
      {
        status: 'unavailable',
        error_code: 'capture_failed',
        thumbnail_url: 'https://provider.example/temporary-thumbnail.png',
        original_url: 'https://provider.example/temporary-original.png',
      },
      {
        status: 'available',
        key: 'third',
        thumbnail_url: '/api/drawing_logs/image/third',
        original_url: '/api/drawing_logs/image/third?variant=original',
      },
    ])

    expect(getTaskImageResults(log)).toEqual([
      {
        status: 'available',
        key: 'first',
        thumbnail_url: '/api/drawing_logs/image/first',
        original_url: '/api/drawing_logs/image/first?variant=original',
      },
      {
        status: 'unavailable',
        error_code: 'capture_failed',
      },
      {
        status: 'available',
        key: 'third',
        thumbnail_url: '/api/drawing_logs/image/third',
        original_url: '/api/drawing_logs/image/third?variant=original',
      },
    ])
  })

  test('fully unavailable metadata preserves its slot without a provider result URL', () => {
    const log = createImageTask(
      [{ status: 'unavailable', error_code: 'capture_failed' }],
      'https://provider.example/temporary-result.png'
    )

    expect(getTaskImageResults(log)).toEqual([
      { status: 'unavailable', error_code: 'capture_failed' },
    ])
  })

  test('unsafe available metadata becomes an unavailable placeholder', () => {
    const log = createImageTask([
      {
        status: 'available',
        key: 'provider-result',
        thumbnail_url: 'https://provider.example/temporary-thumbnail.png',
        original_url: 'https://provider.example/temporary-original.png',
      },
    ])

    expect(getTaskImageResults(log)).toEqual([{ status: 'unavailable' }])
  })
})
