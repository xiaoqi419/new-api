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
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { getRebateUsers } from '../api'
import { REBATE_PAGE_SIZE } from '../constants'
import { formatRebateRatio } from '../lib'
import type { RebateUser } from '../types'
import { GlobalRebateRatioCard } from './global-rebate-ratio-card'
import { RebateRatioDialog } from './rebate-ratio-dialog'

export function RebateRatiosPanel() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [editTarget, setEditTarget] = useState<RebateUser | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['rebate-users', page],
    queryFn: async () => {
      const res = await getRebateUsers(page, REBATE_PAGE_SIZE)
      return {
        items: res.data?.items ?? [],
        total: res.data?.total ?? 0,
      }
    },
    placeholderData: (prev) => prev,
  })
  const users = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / REBATE_PAGE_SIZE))

  return (
    <div className='flex flex-col gap-4'>
      <GlobalRebateRatioCard />

      {isLoading && <Skeleton className='h-64 w-full rounded-xl' />}

      {!isLoading && users.length === 0 && (
        <Empty className='min-h-64 border'>
          <EmptyHeader>
            <EmptyTitle>{t('No one has invited a friend yet')}</EmptyTitle>
            <EmptyDescription>
              {t(
                'Once someone invites a friend they show up here, where you can give them a ratio that overrides the global default.'
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!isLoading && users.length > 0 && (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-20'>{t('User ID')}</TableHead>
                <TableHead>{t('Username')}</TableHead>
                <TableHead>{t('Display Name')}</TableHead>
                <TableHead>{t('Invites')}</TableHead>
                <TableHead>{t('Exclusive Rebate Ratio')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const hasRatio =
                  user.rebate_ratio !== null && user.rebate_ratio !== undefined
                return (
                  <TableRow key={user.id}>
                    <TableCell className='text-muted-foreground font-mono'>
                      {user.id}
                    </TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {user.display_name || '-'}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {user.aff_count}
                    </TableCell>
                    <TableCell>
                      {hasRatio ? (
                        <span className='tabular-nums'>
                          {formatRebateRatio(user.rebate_ratio as number)}
                        </span>
                      ) : (
                        <StatusBadge
                          label={t('Global default')}
                          variant='info'
                          copyable={false}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className='flex justify-end'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setEditTarget(user)}
                        >
                          {t('Edit Ratio')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {total > REBATE_PAGE_SIZE && (
        <div className='flex items-center justify-center gap-3'>
          <Button
            variant='outline'
            size='sm'
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('Previous')}
          </Button>
          <span className='text-muted-foreground text-sm'>
            {page} / {totalPages}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      )}

      <RebateRatioDialog
        open={editTarget !== null}
        user={editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null)
        }}
      />
    </div>
  )
}
