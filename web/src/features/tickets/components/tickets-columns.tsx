import { useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { Eye } from '@/components/icons'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatTimestampToDate } from '@/lib/format'

import {
  TICKET_CATEGORY_LABEL_KEYS,
  TICKET_PRIORITY_LABEL_KEYS,
  TICKET_PRIORITY_VARIANTS,
  TICKET_STATUS_LABEL_KEYS,
  TICKET_STATUS_VARIANTS,
} from '../constants'
import type { Ticket } from '../types'

export function useTicketsColumns(admin: boolean): ColumnDef<Ticket>[] {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const openDetail = (id: number) => {
    if (admin) {
      navigate({ to: '/tickets/admin-detail', search: { id } })
    } else {
      navigate({ to: '/tickets/detail', search: { id } })
    }
  }

  const columns: ColumnDef<Ticket>[] = [
    {
      accessorKey: 'ticket_no',
      header: t('Ticket No.'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <span className='font-mono text-sm'>{row.original.ticket_no}</span>
      ),
      size: 150,
    },
    {
      accessorKey: 'title',
      header: t('Title'),
      meta: { mobileTitle: true },
      cell: ({ row }) => {
        const unread = admin
          ? row.original.admin_unread
          : row.original.user_unread
        return (
          <div className='flex items-center gap-2'>
            <span className='max-w-[260px] truncate font-medium'>
              {row.original.title}
            </span>
            {unread && (
              <StatusBadge label={t('New')} variant='danger' copyable={false} />
            )}
          </div>
        )
      },
      size: 280,
    },
  ]

  if (admin) {
    columns.push({
      accessorKey: 'username',
      header: t('User'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <span className='text-sm'>{row.original.username}</span>
      ),
      size: 120,
    })
  }

  columns.push(
    {
      accessorKey: 'status',
      header: t('Status'),
      meta: { mobileBadge: true },
      cell: ({ row }) => (
        <StatusBadge
          label={t(TICKET_STATUS_LABEL_KEYS[row.original.status])}
          variant={TICKET_STATUS_VARIANTS[row.original.status]}
          copyable={false}
          className='-ml-1.5'
        />
      ),
      size: 110,
    },
    {
      accessorKey: 'priority',
      header: t('Priority'),
      cell: ({ row }) => (
        <StatusBadge
          label={t(TICKET_PRIORITY_LABEL_KEYS[row.original.priority])}
          variant={TICKET_PRIORITY_VARIANTS[row.original.priority]}
          copyable={false}
          className='-ml-1.5'
        />
      ),
      size: 100,
    },
    {
      accessorKey: 'category',
      header: t('Category'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <span className='text-sm'>
          {t(TICKET_CATEGORY_LABEL_KEYS[row.original.category])}
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: 'last_reply_at',
      header: t('Last Reply'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <div className='min-w-[140px] font-mono text-sm'>
          {formatTimestampToDate(row.original.last_reply_at)}
        </div>
      ),
      size: 160,
    },
    {
      id: 'actions',
      header: () => <div className='text-right'>{t('Actions')}</div>,
      cell: ({ row }) => (
        <div className='flex justify-end'>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => openDetail(row.original.id)}
          >
            <Eye className='h-4 w-4' />
            {t('View')}
          </Button>
        </div>
      ),
      meta: { pinned: 'right' as const },
    }
  )

  return columns
}
