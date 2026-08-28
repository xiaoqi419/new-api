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
import { fireEvent, render, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import type { ComponentType } from 'react'
import { beforeAll, describe, expect, test } from 'vitest'

import { TASK_STATUS } from '../../constants'
import type { TaskLog } from '../../types'
import { useTaskLogsColumns } from '../columns/task-logs-columns'
import { TaskLogCard } from '../task-log-card'

const imageResults = [
  {
    status: 'available',
    key: 'first',
    thumbnail_url: '/api/drawing_logs/image/first',
    original_url: '/api/drawing_logs/image/first?variant=original',
  },
  {
    status: 'available',
    key: 'second',
    thumbnail_url: '/api/drawing_logs/image/second',
    original_url: '/api/drawing_logs/image/second?variant=original',
  },
]

const thirdImageResult = {
  status: 'available',
  key: 'third',
  thumbnail_url: '/api/drawing_logs/image/third',
  original_url: '/api/drawing_logs/image/third?variant=original',
}

const mixedImageResults = [
  imageResults[0],
  {
    status: 'unavailable',
    error_code: 'capture_failed',
  },
  thirdImageResult,
]

function createTaskLog(overrides: Partial<TaskLog> = {}): TaskLog {
  return {
    id: 1,
    user_id: 7,
    platform: 'image',
    task_id: 'image-task-1',
    action: 'images_generation',
    channel_id: 3,
    submit_time: 1_787_882_400,
    finish_time: 1_787_882_405,
    progress: '100%',
    properties: { origin_model_name: 'gpt-image-2' },
    data: imageResults,
    result_url: imageResults[0].original_url,
    status: TASK_STATUS.SUCCESS,
    ...overrides,
  }
}

function DesktopDetailsCell({ log }: { log: TaskLog }) {
  const columns = useTaskLogsColumns(false)
  const details = columns.at(-1)
  const Cell = details?.cell as ComponentType<{
    row: {
      original: TaskLog
      getValue: (key: keyof TaskLog) => TaskLog[keyof TaskLog]
    }
  }>

  return (
    <Cell
      row={{
        original: log,
        getValue: (key) => log[key],
      }}
    />
  )
}

describe('task image history', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Preview Images': 'Preview Images',
      'Preview image {{number}}': 'Preview image {{number}}',
      'Previous image': 'Previous image',
      'Next image': 'Next image',
      'Image Preview': 'Image Preview',
      'Generated image': 'Generated image',
      'Image {{current}} of {{total}}': 'Image {{current}} of {{total}}',
      'Image not available': 'Image not available',
    })
  })

  test('card lists thumbnails in response order and opens the original image', () => {
    render(<TaskLogCard log={createTaskLog()} isAdmin={false} />)

    const previews = screen.getAllByRole('button', { name: /Preview image/ })
    expect(previews).toHaveLength(2)
    expect(within(previews[0]).getByRole('img')).toHaveAttribute(
      'src',
      imageResults[0].thumbnail_url
    )
    expect(within(previews[1]).getByRole('img')).toHaveAttribute(
      'src',
      imageResults[1].thumbnail_url
    )

    fireEvent.click(previews[0])

    const dialog = screen.getByRole('dialog', { name: 'Image Preview' })
    expect(
      within(dialog).getByRole('img', { name: 'Generated image' })
    ).toHaveAttribute('src', imageResults[0].original_url)
  })

  test('dialog preserves an unavailable middle slot while browsing every result', () => {
    render(
      <TaskLogCard
        log={createTaskLog({ data: mixedImageResults })}
        isAdmin={false}
      />
    )
    const previews = screen.getAllByRole('button', { name: /Preview image/ })
    expect(previews).toHaveLength(3)
    expect(
      within(previews[1]).getByText('Image not available')
    ).toBeInTheDocument()
    expect(within(previews[2]).getByRole('img')).toHaveAttribute(
      'src',
      thirdImageResult.thumbnail_url
    )

    fireEvent.click(screen.getAllByRole('button', { name: /Preview image/ })[0])

    const dialog = screen.getByRole('dialog', { name: 'Image Preview' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next image' }))

    expect(within(dialog).getByText('Image 2 of 3')).toBeInTheDocument()
    expect(
      within(dialog).getAllByText('Image not available').length
    ).toBeGreaterThan(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next image' }))

    expect(within(dialog).getByText('Image 3 of 3')).toBeInTheDocument()
    expect(
      within(dialog).getByRole('img', { name: 'Generated image' })
    ).toHaveAttribute('src', thirdImageResult.original_url)
  })

  test('fully unavailable image results keep every slot visible', () => {
    render(
      <TaskLogCard
        log={createTaskLog({
          data: [
            { status: 'unavailable', error_code: 'capture_failed' },
            { status: 'unavailable', error_code: 'capture_failed' },
          ],
          result_url: 'https://provider.example/temporary-result.png',
        })}
        isAdmin={false}
      />
    )

    const previews = screen.getAllByRole('button', { name: /Preview image/ })
    expect(previews).toHaveLength(2)
    expect(
      within(previews[0]).getByText('Image not available')
    ).toBeInTheDocument()
    expect(
      within(previews[1]).getByText('Image not available')
    ).toBeInTheDocument()

    fireEvent.click(previews[0])
    const dialog = screen.getByRole('dialog', { name: 'Image Preview' })
    expect(within(dialog).getByText('Image 1 of 2')).toBeInTheDocument()
    expect(
      within(dialog).getAllByText('Image not available').length
    ).toBeGreaterThan(0)
  })

  test('desktop details cell renders image thumbnails instead of a video preview', () => {
    render(<DesktopDetailsCell log={createTaskLog()} />)

    expect(
      screen.getAllByRole('button', { name: /Preview image/ })
    ).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: 'Click to preview video' })
    ).not.toBeInTheDocument()
  })

  test('expired thumbnail and original show an explicit unavailable state', () => {
    render(<TaskLogCard log={createTaskLog()} isAdmin={false} />)
    const firstPreview = screen.getAllByRole('button', {
      name: /Preview image/,
    })[0]
    fireEvent.error(within(firstPreview).getByRole('img'))

    expect(
      within(firstPreview).getByText('Image not available')
    ).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /Preview image/ })[1])
    const dialog = screen.getByRole('dialog', { name: 'Image Preview' })
    fireEvent.error(
      within(dialog).getByRole('img', { name: 'Generated image' })
    )

    expect(within(dialog).getByText('Image not available')).toBeInTheDocument()
  })

  test('failed image task shows only its error without a result preview', () => {
    render(
      <TaskLogCard
        log={createTaskLog({
          status: TASK_STATUS.FAILURE,
          fail_reason: 'upstream temporarily unavailable',
        })}
        isAdmin={false}
      />
    )

    expect(
      screen.getByText('upstream temporarily unavailable')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Preview image/ })
    ).not.toBeInTheDocument()
  })

  test('video and Suno tasks retain their existing preview actions', () => {
    const { rerender } = render(
      <TaskLogCard
        log={createTaskLog({
          platform: 'kling',
          action: 'generate',
          result_url: 'https://example.com/video.mp4',
          data: {},
        })}
        isAdmin={false}
      />
    )

    expect(
      screen.getByRole('button', { name: 'Preview Video' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Preview image/ })
    ).not.toBeInTheDocument()

    rerender(
      <TaskLogCard
        log={createTaskLog({
          platform: 'suno',
          action: 'MUSIC',
          data: [{ id: 'clip-1', audio_url: 'https://example.com/audio.mp3' }],
          result_url: undefined,
        })}
        isAdmin={false}
      />
    )

    expect(
      screen.getByRole('button', { name: 'Preview Audio' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Preview image/ })
    ).not.toBeInTheDocument()
  })
})
