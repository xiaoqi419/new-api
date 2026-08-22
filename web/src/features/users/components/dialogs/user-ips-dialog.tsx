import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
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
import { Loader2 } from '@/components/icons'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import dayjs from '@/lib/dayjs'

import { getUserIps, type UserIpRecord } from '../../api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: number; username: string } | null
}

export function UserIpsDialog(props: Props) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<UserIpRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!props.open || !props.user) {
      setRows([])
      return
    }
    const userId = props.user.id
    let cancelled = false
    setLoading(true)
    const load = async () => {
      try {
        const res = await getUserIps(userId)
        if (cancelled) return
        if (res.success && res.data) {
          setRows(res.data)
        } else {
          toast.error(res.message || t('Failed to load'))
        }
      } catch {
        if (!cancelled) toast.error(t('Failed to load'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [props.open, props.user, t])

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        props.user
          ? `${t('User IP Records')} - ${props.user.username}`
          : t('User IP Records')
      }
      description={t(
        'IPs come from login and request logs, de-duplicated and sorted by most recent. Request-log IPs only exist when the user has logging enabled.'
      )}
      contentClassName='sm:max-w-lg'
      contentHeight='auto'
      bodyClassName='space-y-3'
    >
      {loading && (
        <div className='flex items-center justify-center py-8'>
          <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <Empty className='min-h-40 border'>
          <EmptyHeader>
            <EmptyTitle>{t('No IP records')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {!loading && rows.length > 0 && (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('IP')}</TableHead>
                <TableHead className='w-24'>{t('Count')}</TableHead>
                <TableHead>{t('Last Time')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.ip}>
                  <TableCell className='font-mono'>{row.ip}</TableCell>
                  <TableCell className='tabular-nums'>
                    {row.count ?? 0}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {row.last_time
                      ? dayjs(row.last_time * 1000).format(
                          'YYYY-MM-DD HH:mm:ss'
                        )
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Dialog>
  )
}
