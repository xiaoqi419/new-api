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
/* eslint-disable react-refresh/only-export-components */
import {
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  FileText,
  List,
  Loader,
  type LucideIcon,
  Music,
  Pause,
  Play,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { StatusBadgeProps, StatusVariant } from '@/components/status-badge'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { stringToColor } from '@/lib/colors'
import { cn } from '@/lib/utils'

import {
  ACTIVE_TASK_STATUSES,
  TASK_ACTIONS,
  TASK_STATUS,
} from '../../constants'
import { formatElapsedSeconds } from '../../lib/format'
import {
  taskActionMapper,
  taskPlatformMapper,
  taskStatusMapper,
} from '../../lib/mappers'
import { useNowSeconds } from '../../lib/use-elapsed-clock'
import type { TaskLog } from '../../types'

/** Filled, tinted pill classes per status variant (classic-style colored tags). */
const FILLED_TAG: Record<StatusVariant, string> = {
  success:
    'border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  green:
    'border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'light-green':
    'border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  lime: 'border-lime-500/25 bg-lime-500/15 text-lime-600 dark:text-lime-400',
  warning:
    'border-amber-500/25 bg-amber-500/15 text-amber-600 dark:text-amber-400',
  amber:
    'border-amber-500/25 bg-amber-500/15 text-amber-600 dark:text-amber-400',
  yellow:
    'border-amber-500/25 bg-amber-500/15 text-amber-600 dark:text-amber-400',
  orange:
    'border-orange-500/25 bg-orange-500/15 text-orange-600 dark:text-orange-400',
  danger: 'border-red-500/25 bg-red-500/15 text-red-600 dark:text-red-400',
  red: 'border-red-500/25 bg-red-500/15 text-red-600 dark:text-red-400',
  pink: 'border-pink-500/25 bg-pink-500/15 text-pink-600 dark:text-pink-400',
  info: 'border-sky-500/25 bg-sky-500/15 text-sky-600 dark:text-sky-400',
  'light-blue':
    'border-sky-500/25 bg-sky-500/15 text-sky-600 dark:text-sky-400',
  blue: 'border-blue-500/25 bg-blue-500/15 text-blue-600 dark:text-blue-400',
  indigo:
    'border-indigo-500/25 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  cyan: 'border-cyan-500/25 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  teal: 'border-teal-500/25 bg-teal-500/15 text-teal-600 dark:text-teal-400',
  purple:
    'border-purple-500/25 bg-purple-500/15 text-purple-600 dark:text-purple-400',
  violet:
    'border-violet-500/25 bg-violet-500/15 text-violet-600 dark:text-violet-400',
  neutral:
    'border-slate-400/30 bg-slate-400/15 text-slate-600 dark:text-slate-300',
  grey: 'border-slate-400/30 bg-slate-400/15 text-slate-600 dark:text-slate-300',
}

const STATUS_ICON: Record<string, LucideIcon> = {
  [TASK_STATUS.SUCCESS]: CircleCheck,
  [TASK_STATUS.NOT_START]: Pause,
  [TASK_STATUS.SUBMITTED]: Clock,
  [TASK_STATUS.IN_PROGRESS]: Play,
  [TASK_STATUS.FAILURE]: CircleX,
  [TASK_STATUS.QUEUED]: List,
  [TASK_STATUS.UNKNOWN]: CircleHelp,
  '': Loader,
}

const ACTION_ICON: Record<string, LucideIcon> = {
  [TASK_ACTIONS.MUSIC]: Music,
  [TASK_ACTIONS.LYRICS]: FileText,
  [TASK_ACTIONS.GENERATE]: Sparkles,
  [TASK_ACTIONS.TEXT_GENERATE]: Sparkles,
  [TASK_ACTIONS.FIRST_TAIL_GENERATE]: Sparkles,
  [TASK_ACTIONS.REFERENCE_GENERATE]: Sparkles,
  [TASK_ACTIONS.REMIX_GENERATE]: Sparkles,
}

function TaskTag({
  variant,
  icon: Icon,
  label,
  className,
}: {
  variant?: StatusBadgeProps['variant']
  icon?: LucideIcon
  label: string
  className?: string
}) {
  const key = (variant ?? 'neutral') as StatusVariant
  return (
    <span
      className={cn(
        'inline-flex w-fit max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        FILLED_TAG[key] ?? FILLED_TAG.neutral,
        className
      )}
    >
      {Icon ? <Icon className='size-3.5 shrink-0' /> : null}
      <span className='truncate'>{label}</span>
    </span>
  )
}

export function TaskStatusTag({ status }: { status: string }) {
  const { t } = useTranslation()
  const key = status || ''
  return (
    <TaskTag
      variant={taskStatusMapper.getVariant(key)}
      icon={STATUS_ICON[key] ?? CircleHelp}
      label={t(taskStatusMapper.getLabel(key, key || 'Submitting'))}
    />
  )
}

export function TaskTypeTag({ action }: { action: string }) {
  const { t } = useTranslation()
  const key = action || ''
  return (
    <TaskTag
      variant={taskActionMapper.getVariant(key)}
      icon={ACTION_ICON[key] ?? CircleHelp}
      label={t(taskActionMapper.getLabel(key))}
    />
  )
}

export function TaskPlatformTag({ platform }: { platform: string }) {
  if (!platform) {
    return <span className='text-muted-foreground/60 text-xs'>-</span>
  }
  return (
    <TaskTag
      variant={taskPlatformMapper.getVariant(platform)}
      label={taskPlatformMapper.getLabel(platform, platform)}
    />
  )
}

/** Filled channel pill colored deterministically by id and copyable on click. */
export function ChannelTag({ channelId }: { channelId: number }) {
  const { copyToClipboard } = useCopyToClipboard()
  const variant = stringToColor(String(channelId)) as StatusVariant
  return (
    <button
      type='button'
      onClick={(e) => {
        e.stopPropagation()
        copyToClipboard(String(channelId))
      }}
      className={cn(
        'inline-flex w-fit cursor-copy items-center rounded-full border px-2 py-0.5 font-mono text-xs font-medium transition-colors hover:brightness-95 active:scale-95 dark:hover:brightness-110',
        FILLED_TAG[variant] ?? FILLED_TAG.neutral
      )}
      title={`Click to copy: ${channelId}`}
    >
      #{channelId}
    </button>
  )
}

/** Whole-second duration pill (green normal, red over a minute), with a
 * realtime elapsed clock for tasks still running. */
export function TaskDurationTag({ log }: { log: TaskLog }) {
  const isActive = ACTIVE_TASK_STATUSES.includes(log.status)
  const nowSec = useNowSeconds(isActive)

  if (log.finish_time && log.submit_time) {
    const sec = Math.max(0, Math.round(log.finish_time - log.submit_time))
    return <TaskTag variant={sec > 60 ? 'red' : 'green'} label={`${sec} s`} />
  }

  if (isActive && log.submit_time) {
    const elapsed = Math.max(0, nowSec - log.submit_time)
    return (
      <span className='inline-flex items-center gap-1 rounded-full border border-blue-500/25 bg-blue-500/15 px-2 py-0.5 font-mono text-xs text-blue-600 tabular-nums dark:text-blue-400'>
        <Clock className='size-3' />
        {formatElapsedSeconds(elapsed)}
      </span>
    )
  }

  return <span className='text-muted-foreground/60 text-xs'>-</span>
}

/** Real progress bar with a trailing percentage (amber when the task failed). */
export function TaskProgressBar({ log }: { log: TaskLog }) {
  const raw = log.progress
  if (!raw) {
    return <span className='text-muted-foreground/60 text-xs'>-</span>
  }
  const numeric = raw.replace('%', '')
  if (Number.isNaN(Number(numeric))) {
    return <span className='text-xs'>{raw}</span>
  }
  const pct = Math.min(100, Math.max(0, Number.parseInt(numeric, 10) || 0))
  const isFailure = log.status === TASK_STATUS.FAILURE
  return (
    <div className='flex min-w-[110px] items-center gap-2'>
      <div className='bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full'>
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isFailure ? 'bg-warning' : 'bg-primary'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className='text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums'>
        {pct}%
      </span>
    </div>
  )
}
