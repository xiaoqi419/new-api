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
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatQuota, formatTimestampToDate } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import { getAffiliateCode, getSelfRebate } from './api'
import { REBATE_PAGE_SIZE } from './constants'
import { buildInviteLink, formatRebateRatio, rebateStatusMeta } from './lib'

export function Invitation() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const user = useAuthStore((s) => s.auth.user)

  const { data: affResp, isLoading: affLoading } = useQuery({
    queryKey: ['invitation-aff'],
    queryFn: getAffiliateCode,
  })
  const { data: rebateResp, isFetching } = useQuery({
    queryKey: ['invitation-rebate', page],
    queryFn: () => getSelfRebate(page, REBATE_PAGE_SIZE),
    placeholderData: (prev) => prev,
  })

  const affCode = affResp?.success ? affResp.data : ''
  const affLink = buildInviteLink(affCode)
  const rebate = rebateResp?.success ? rebateResp.data : undefined
  const records = rebate?.records.items ?? []
  const total = rebate?.records.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / REBATE_PAGE_SIZE))

  const stats: Array<[string, string]> = [
    [t('Invited Friends'), String(user?.aff_count ?? 0)],
    [t('Pending Rebate'), formatQuota(rebate?.pending_quota ?? 0)],
    [t('Paid Rebate'), formatQuota(rebate?.paid_quota ?? 0)],
  ]

  return (
    <div className='mx-auto flex w-full max-w-5xl flex-col gap-4'>
      <Card data-card-hover='false'>
        <CardContent className='flex flex-col gap-4 p-4 sm:flex-row sm:items-center'>
          {affLoading ? (
            <Skeleton className='h-[136px] w-full rounded-lg' />
          ) : (
            <>
              {affLink && (
                <div className='self-center rounded-lg bg-white p-2'>
                  <QRCodeSVG value={affLink} size={120} />
                </div>
              )}
              <div className='min-w-0 flex-1'>
                <h3 className='text-sm font-semibold'>{t('Invite Link')}</h3>
                <p className='text-muted-foreground mt-0.5 text-xs'>
                  {t(
                    'Share this link. When friends sign up and top up, you earn rebates.'
                  )}
                </p>
                <div className='mt-3 flex items-center gap-2'>
                  <Input
                    value={affLink}
                    readOnly
                    className='bg-background/70 h-9 min-w-0 flex-1 font-mono text-xs'
                  />
                  <CopyButton
                    value={affLink}
                    variant='outline'
                    className='bg-background size-9 shrink-0'
                    iconClassName='size-4'
                    tooltip={t('Copy invite link')}
                    aria-label={t('Copy invite link')}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        {stats.map(([label, value]) => (
          <Card key={label} data-card-hover='false'>
            <CardContent className='p-4'>
              <div className='text-muted-foreground text-xs font-medium'>
                {label}
              </div>
              <div className='mt-1 text-2xl font-semibold tabular-nums'>
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='flex flex-col gap-3'>
        <h3 className='text-sm font-semibold'>{t('Rebate Records')}</h3>

        {records.length === 0 ? (
          <Empty className='min-h-48 border'>
            <EmptyHeader>
              <EmptyTitle>{t('No rebate records yet')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className='rounded-xl border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Friend ID')}</TableHead>
                  <TableHead>{t('Top-up Amount')}</TableHead>
                  <TableHead>{t('Rebate Ratio')}</TableHead>
                  <TableHead>{t('Rebate Amount')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Created At')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const meta = rebateStatusMeta(record.status)
                  return (
                    <TableRow key={record.id}>
                      <TableCell className='font-mono'>
                        {record.invitee_id}
                      </TableCell>
                      <TableCell className='tabular-nums'>
                        {formatQuota(record.topup_quota)}
                      </TableCell>
                      <TableCell className='tabular-nums'>
                        {formatRebateRatio(record.rebate_ratio)}
                      </TableCell>
                      <TableCell className='tabular-nums'>
                        {formatQuota(record.rebate_quota)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={t(meta.key)}
                          variant={meta.variant}
                          copyable={false}
                        />
                      </TableCell>
                      <TableCell className='text-muted-foreground text-xs'>
                        {record.create_time
                          ? formatTimestampToDate(record.create_time, 'seconds')
                          : '-'}
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
      </div>
    </div>
  )
}
