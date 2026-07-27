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
import type { ColumnDef } from '@tanstack/react-table'
import { ImageIcon, WandSparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'

import type { DrawingLog } from '../../types'
import { ImageDialog } from '../dialogs/image-dialog'
import { PromptDialog } from '../dialogs/prompt-dialog'
import { createChannelColumn } from './column-helpers'

const LOG_MODE_LABELS: Record<string, string> = {
  images_generation: 'Image Generation',
  images_edit: 'Image Edit',
  chat_image: 'Chat Image Output',
  image_generation_call: 'Image Tool Call',
}

function parseResultKeys(raw?: string): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function toImageSrc(entry: string): string {
  if (entry.startsWith('http://') || entry.startsWith('https://')) {
    return entry
  }
  return `/api/drawing_logs/image/${entry}`
}

function statusVariant(
  status: string
): 'success' | 'danger' | 'warning' | 'neutral' {
  switch (status.toLowerCase()) {
    case 'success':
      return 'success'
    case 'failed':
    case 'failure':
      return 'danger'
    case 'in_progress':
    case 'submitted':
    case 'not_start':
      return 'warning'
    default:
      return 'neutral'
  }
}

export function useDrawingLogsColumns(
  isAdmin: boolean
): ColumnDef<DrawingLog>[] {
  const { t } = useTranslation()

  const statusLabel = (status: string): string => {
    const s = status.toLowerCase()
    if (s === 'success') return t('Success')
    if (s === 'failed' || s === 'failure') return t('Failed')
    return status || '-'
  }

  const typeLabel = (logMode: string): string => {
    if (LOG_MODE_LABELS[logMode]) return t(LOG_MODE_LABELS[logMode])
    if (logMode.startsWith('mj_')) return logMode.slice(3)
    return logMode || '-'
  }

  const columns: ColumnDef<DrawingLog>[] = [
    {
      accessorKey: 'created_at',
      header: t('Time'),
      cell: ({ row }) => {
        const log = row.original
        return (
          <div className='flex min-w-0 flex-col gap-0.5'>
            <span className='truncate font-mono text-xs tabular-nums'>
              {formatTimestampToDate(log.created_at, 'seconds')}
            </span>
            <StatusBadge
              label={statusLabel(log.status)}
              variant={statusVariant(log.status)}
              size='sm'
              copyable={false}
            />
          </div>
        )
      },
      size: 180,
    },
  ]

  if (isAdmin) {
    columns.push(createChannelColumn<DrawingLog>({ headerLabel: t('Channel') }))
    columns.push({
      accessorKey: 'username',
      header: t('User'),
      cell: ({ row }) => {
        const username = row.original.username
        if (!username) {
          return <span className='text-muted-foreground/60 text-xs'>-</span>
        }
        return <span className='truncate text-xs'>{username}</span>
      },
    })
  }

  columns.push({
    accessorKey: 'source',
    header: t('Source'),
    cell: ({ row }) => {
      const source = row.original.source
      const isMj = source === 'mj'
      return (
        <StatusBadge
          label={isMj ? 'Midjourney' : t('Image')}
          variant={isMj ? 'info' : 'neutral'}
          icon={isMj ? WandSparkles : ImageIcon}
          size='sm'
          copyable={false}
          className='-ml-1.5'
        />
      )
    },
  })

  columns.push({
    accessorKey: 'model_name',
    header: t('Model'),
    cell: ({ row }) => {
      const model = row.original.model_name
      if (!model) {
        return <span className='text-muted-foreground/60 text-xs'>-</span>
      }
      return (
        <StatusBadge
          label={model}
          copyText={model}
          variant='neutral'
          size='sm'
          className='border-border/60 bg-muted/30 !text-foreground max-w-[180px] truncate rounded-md border px-1.5 py-0.5 font-mono'
        />
      )
    },
    meta: { mobileTitle: true },
  })

  columns.push({
    accessorKey: 'log_mode',
    header: t('Type'),
    cell: ({ row }) => (
      <span className='text-xs'>{typeLabel(row.original.log_mode)}</span>
    ),
  })

  columns.push({
    accessorKey: 'quota',
    header: t('Quota'),
    cell: ({ row }) => (
      <span className='font-mono text-xs tabular-nums'>
        {formatLogQuota(row.original.quota)}
      </span>
    ),
  })

  columns.push({
    accessorKey: 'result_urls',
    header: t('Image'),
    cell: function ImageCell({ row }) {
      const log = row.original
      const keys = parseResultKeys(log.result_urls)
      const [dialogOpen, setDialogOpen] = useState(false)

      if (keys.length === 0) {
        return <span className='text-muted-foreground/60 text-xs'>-</span>
      }
      const src = toImageSrc(keys[0])

      return (
        <>
          <button
            type='button'
            className='group block'
            onClick={() => setDialogOpen(true)}
            title={t('Click to view image')}
          >
            <img
              src={src}
              alt={t('Image')}
              loading='lazy'
              className='border-border/60 h-10 w-10 rounded-md border object-cover transition group-hover:opacity-80'
            />
          </button>
          <ImageDialog
            imageUrl={src}
            taskId={log.source_id}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
        </>
      )
    },
  })

  columns.push({
    accessorKey: 'prompt',
    header: t('Prompt'),
    cell: function PromptCell({ row }) {
      const prompt = row.original.prompt
      const [dialogOpen, setDialogOpen] = useState(false)

      if (!prompt) {
        return <span className='text-muted-foreground/60 text-xs'>-</span>
      }

      return (
        <>
          <button
            type='button'
            className='group flex max-w-[220px] items-center text-left text-xs'
            onClick={() => setDialogOpen(true)}
            title={t('Click to view full prompt')}
          >
            <span className='text-muted-foreground truncate leading-snug group-hover:underline'>
              {prompt}
            </span>
          </button>
          <PromptDialog
            prompt={prompt}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
        </>
      )
    },
    size: 200,
    maxSize: 220,
  })

  return columns
}
