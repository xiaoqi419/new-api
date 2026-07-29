import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import { Copy, Eye, Music, Video } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'

import { TASK_ACTIONS, TASK_STATUS } from '../constants'
import type { TaskLog } from '../types'
import { parseTaskData } from './columns/task-logs-columns'
import {
  TaskDurationTag,
  TaskPlatformTag,
  TaskProgressBar,
  TaskStatusTag,
  TaskTypeTag,
} from './columns/task-visuals'
import {
  AudioPreviewDialog,
  type AudioClip,
} from './dialogs/audio-preview-dialog'
import { TaskDetailsDialog } from './dialogs/task-details-dialog'
import { VideoPreviewDialog } from './dialogs/video-preview-dialog'

const VIDEO_ACTIONS = new Set<string>([
  TASK_ACTIONS.GENERATE,
  TASK_ACTIONS.TEXT_GENERATE,
  TASK_ACTIONS.FIRST_TAIL_GENERATE,
  TASK_ACTIONS.REFERENCE_GENERATE,
  TASK_ACTIONS.REMIX_GENERATE,
])

function toRecord(data: unknown): Record<string, unknown> | null {
  if (!data) return null
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  if (typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return null
}

function buildParamString(
  detail: Record<string, unknown> | null,
  t: (key: string) => string
): string {
  if (!detail) return ''
  const parts: string[] = []
  if (typeof detail.resolution === 'string') parts.push(detail.resolution)
  if (typeof detail.ratio === 'string') parts.push(detail.ratio)
  if (detail.duration != null && detail.duration !== '') {
    parts.push(`${detail.duration}s`)
  }
  if (detail.framespersecond != null && detail.framespersecond !== '') {
    parts.push(`${detail.framespersecond}fps`)
  }
  if ('generate_audio' in detail) {
    parts.push(detail.generate_audio ? t('With Audio') : t('No Audio'))
  }
  return parts.join(' · ')
}

function InfoRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className='flex items-center gap-1 text-sm'>
      <span className='text-muted-foreground shrink-0'>{label}:</span>
      <span className='min-w-0 truncate'>{children}</span>
    </div>
  )
}

function ResultAction({
  log,
  isSunoSuccess,
  isSuccess,
  isVideoTask,
  isFailure,
  onPreviewAudio,
  onPreviewVideo,
}: {
  log: TaskLog
  isSunoSuccess: boolean
  isSuccess: boolean
  isVideoTask: boolean
  isFailure: boolean
  onPreviewAudio: () => void
  onPreviewVideo: () => void
}) {
  const { t } = useTranslation()

  if (isSunoSuccess) {
    return (
      <Button
        variant='ghost'
        size='sm'
        className='text-primary h-7 px-2'
        onClick={onPreviewAudio}
      >
        <Music className='size-3.5' />
        {t('Preview Audio')}
      </Button>
    )
  }

  if (isSuccess && isVideoTask) {
    return (
      <Button
        variant='ghost'
        size='sm'
        className='text-primary h-7 px-2'
        onClick={onPreviewVideo}
      >
        <Video className='size-3.5' />
        {t('Preview Video')}
      </Button>
    )
  }

  if (isFailure) {
    return (
      <span
        className='truncate text-xs text-red-600 dark:text-red-400'
        title={log.fail_reason || t('Failed')}
      >
        {log.fail_reason || t('Failed')}
      </span>
    )
  }

  return <span className='text-muted-foreground text-xs'>{t('None')}</span>
}

export function TaskLogCard({
  log,
  isAdmin,
}: {
  log: TaskLog
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  const detail = toRecord(log.data)
  const model =
    log.properties?.origin_model_name ||
    log.properties?.upstream_model_name ||
    '-'
  const paramStr = buildParamString(detail, t)
  const usage = toRecord(detail?.usage)
  const tokens =
    typeof usage?.total_tokens === 'number' ? usage.total_tokens : 0

  const isSuccess = log.status === TASK_STATUS.SUCCESS
  const isFailure = log.status === TASK_STATUS.FAILURE
  const isVideoTask = VIDEO_ACTIONS.has(log.action)
  const videoUrl =
    log.result_url && /^https?:\/\//.test(log.result_url)
      ? log.result_url
      : `/v1/videos/${log.task_id}/content`

  const audioClips = (
    parseTaskData(log.data) as Record<string, unknown>[]
  ).filter((c) => c && typeof c === 'object' && c.audio_url)
  const isSunoSuccess =
    log.platform === 'suno' && isSuccess && audioClips.length > 0

  return (
    <div className='flex flex-col gap-2.5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <TaskStatusTag status={log.status} />
          <TaskTypeTag action={log.action} />
        </div>
        <TaskPlatformTag platform={log.platform} />
      </div>

      <TaskProgressBar log={log} />

      <div className='flex flex-col gap-1'>
        <InfoRow label={t('Model')}>
          <span className='font-mono' title={model}>
            {model}
          </span>
        </InfoRow>

        {paramStr && <InfoRow label={t('Parameters')}>{paramStr}</InfoRow>}

        {tokens > 0 && (
          <InfoRow label={t('Billing')}>
            {tokens.toLocaleString()} tokens
          </InfoRow>
        )}

        {isSuccess && (log.quota ?? 0) > 0 && (
          <InfoRow label={t('Quota Consumed')}>
            <span className='font-semibold'>
              {formatLogQuota(log.quota ?? 0)}
            </span>
          </InfoRow>
        )}

        <div className='flex items-center gap-1 text-sm'>
          <span className='text-muted-foreground shrink-0'>
            {t('Task ID')}:
          </span>
          <span className='min-w-0 truncate font-mono' title={log.task_id}>
            {log.task_id || '-'}
          </span>
          {log.task_id && (
            <button
              type='button'
              className='text-muted-foreground hover:text-foreground shrink-0 cursor-copy transition-colors'
              onClick={() => copyToClipboard(log.task_id)}
              title={t('Copy to clipboard')}
              aria-label={t('Copy to clipboard')}
            >
              <Copy className='size-3.5' />
            </button>
          )}
        </div>

        {isAdmin && (
          <div className='flex items-center gap-4 text-sm'>
            <span className='flex items-center gap-1'>
              <span className='text-muted-foreground'>{t('Channel')}:</span>
              <span className='font-mono'>{log.channel_id ?? '-'}</span>
            </span>
            <span className='flex min-w-0 items-center gap-1'>
              <span className='text-muted-foreground shrink-0'>
                {t('User')}:
              </span>
              <span
                className='min-w-0 truncate'
                title={log.username || String(log.user_id || '')}
              >
                {log.username || log.user_id || '-'}
              </span>
            </span>
          </div>
        )}
      </div>

      <div className='flex items-center justify-between gap-2'>
        <span className='text-muted-foreground text-xs'>
          {log.submit_time
            ? formatTimestampToDate(log.submit_time, 'seconds')
            : '-'}
        </span>
        <TaskDurationTag log={log} />
      </div>

      <div className='border-border flex items-center justify-between gap-2 border-t pt-2.5'>
        <div className='min-w-0'>
          <ResultAction
            log={log}
            isSunoSuccess={isSunoSuccess}
            isSuccess={isSuccess}
            isVideoTask={isVideoTask}
            isFailure={isFailure}
            onPreviewAudio={() => setAudioOpen(true)}
            onPreviewVideo={() => setVideoOpen(true)}
          />
        </div>

        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground h-7 shrink-0 px-2'
          onClick={() => setDetailsOpen(true)}
        >
          <Eye className='size-3.5' />
          {t('Details')}
        </Button>
      </div>

      <TaskDetailsDialog
        log={log}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
      {isVideoTask && (
        <VideoPreviewDialog
          open={videoOpen}
          onOpenChange={setVideoOpen}
          url={videoUrl}
        />
      )}
      {audioClips.length > 0 && (
        <AudioPreviewDialog
          open={audioOpen}
          onOpenChange={setAudioOpen}
          clips={audioClips as AudioClip[]}
        />
      )}
    </div>
  )
}
