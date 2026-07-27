import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatTimestampToDate } from '@/lib/format'

import {
  ANNOUNCEMENT_LEVEL_LABEL_KEYS,
  ANNOUNCEMENT_LEVEL_VARIANTS,
  ANNOUNCEMENT_TYPE_LABEL_KEYS,
  ANNOUNCEMENT_TYPE_VARIANTS,
} from '../constants'
import type { Announcement } from '../types'
import { useAnnouncements } from './announcements-provider'

export function useAnnouncementsColumns(): ColumnDef<Announcement>[] {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = useAnnouncements()

  return [
    {
      accessorKey: 'title',
      header: t('Title'),
      meta: { mobileTitle: true },
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.title}</span>
      ),
      size: 260,
    },
    {
      accessorKey: 'type',
      header: t('Category'),
      meta: { mobileBadge: true },
      cell: ({ row }) => (
        <StatusBadge
          label={t(ANNOUNCEMENT_TYPE_LABEL_KEYS[row.original.type])}
          variant={ANNOUNCEMENT_TYPE_VARIANTS[row.original.type]}
          copyable={false}
          className='-ml-1.5'
        />
      ),
      size: 120,
    },
    {
      accessorKey: 'level',
      header: t('Level'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <StatusBadge
          label={t(ANNOUNCEMENT_LEVEL_LABEL_KEYS[row.original.level])}
          variant={ANNOUNCEMENT_LEVEL_VARIANTS[row.original.level]}
          copyable={false}
          className='-ml-1.5'
        />
      ),
      size: 110,
    },
    {
      accessorKey: 'version',
      header: t('Version'),
      meta: { mobileHidden: true },
      cell: ({ row }) =>
        row.original.version ? (
          <span className='font-mono text-sm'>{row.original.version}</span>
        ) : (
          <span className='text-muted-foreground'>-</span>
        ),
      size: 120,
    },
    {
      accessorKey: 'published',
      header: t('Status'),
      cell: ({ row }) => (
        <StatusBadge
          label={row.original.published ? t('Published') : t('Draft')}
          variant={row.original.published ? 'success' : 'neutral'}
          copyable={false}
          className='-ml-1.5'
        />
      ),
      size: 110,
    },
    {
      accessorKey: 'publish_time',
      header: t('Publish Date'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <div className='min-w-[140px] font-mono text-sm'>
          {formatTimestampToDate(row.original.publish_time)}
        </div>
      ),
      size: 160,
    },
    {
      id: 'actions',
      header: () => <div className='text-right'>{t('Actions')}</div>,
      cell: ({ row }) => (
        <div className='flex justify-end gap-1'>
          <Button
            size='icon'
            variant='ghost'
            aria-label={t('Edit')}
            onClick={() => {
              setCurrentRow(row.original)
              setOpen('update')
            }}
          >
            <Pencil className='h-4 w-4' />
          </Button>
          <Button
            size='icon'
            variant='ghost'
            aria-label={t('Delete')}
            onClick={() => {
              setCurrentRow(row.original)
              setOpen('delete')
            }}
          >
            <Trash2 className='text-destructive h-4 w-4' />
          </Button>
        </div>
      ),
      meta: { pinned: 'right' as const },
    },
  ]
}
