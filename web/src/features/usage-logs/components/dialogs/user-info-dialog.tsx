import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
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
import { Loader2 } from '@/components/icons'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { formatQuota, formatCompactNumber } from '@/lib/format'

import { getUserInfo, getUserStat } from '../../api'
import type { UserErrorStatRow, UserInfo, UserStat } from '../../types'

interface UserInfoDialogProps {
  userId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface WindowStats {
  quota: number
  requests: number
  failures: number
}

const emptyWindowStats: WindowStats = { quota: 0, requests: 0, failures: 0 }

function toWindowStats(data: UserStat | undefined): WindowStats {
  if (!data) return emptyWindowStats
  return {
    quota: data.quota || 0,
    requests: data.requests || 0,
    failures: data.failures || 0,
  }
}

// 日/月边界按查看者本地时区算，与日志列表里显示的时间保持同一口径。
function localDayStart(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function localMonthStart(): number {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

export function UserInfoDialog({
  userId,
  open,
  onOpenChange,
}: UserInfoDialogProps) {
  const { t } = useTranslation()
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [today, setToday] = useState<WindowStats>(emptyWindowStats)
  const [month, setMonth] = useState<WindowStats>(emptyWindowStats)
  const [failureReasons, setFailureReasons] = useState<UserErrorStatRow[]>([])
  const [isLoadingStats, setIsLoadingStats] = useState(false)

  const fetchUserInfo = useCallback(
    async (id: number) => {
      setIsLoading(true)
      try {
        const result = await getUserInfo(id)
        if (result.success) {
          setUserInfo(result.data || null)
        } else {
          toast.error(result.message || t('Failed to fetch user information'))
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch user info:', error)
        toast.error(t('Failed to fetch user information'))
      } finally {
        setIsLoading(false)
      }
    },
    [t]
  )

  const fetchStats = useCallback(
    async (id: number) => {
      setIsLoadingStats(true)
      const now = Math.floor(Date.now() / 1000)

      try {
        const [dayStat, monthStat] = await Promise.all([
          getUserStat({
            user_id: id,
            start_timestamp: localDayStart(),
            end_timestamp: now,
          }),
          getUserStat({
            user_id: id,
            start_timestamp: localMonthStart(),
            end_timestamp: now,
          }),
        ])

        setToday(toWindowStats(dayStat.data))
        setMonth(toWindowStats(monthStat.data))
        setFailureReasons(monthStat.data?.by_content || [])
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch user usage statistics:', error)
        toast.error(t('Failed to fetch usage statistics'))
      } finally {
        setIsLoadingStats(false)
      }
    },
    [t]
  )

  useEffect(() => {
    if (open && userId) {
      fetchUserInfo(userId)
    }
  }, [open, userId, fetchUserInfo])

  useEffect(() => {
    if (!open) {
      setToday(emptyWindowStats)
      setMonth(emptyWindowStats)
      setFailureReasons([])
    }
  }, [open])

  useEffect(() => {
    if (open && userId) {
      fetchStats(userId)
    }
  }, [open, userId, fetchStats])

  const InfoItem = ({
    label,
    value,
  }: {
    label: string
    value: string | number
  }) => (
    <div className='space-y-1.5'>
      <Label className='text-muted-foreground text-xs'>{label}</Label>
      <div className='text-sm font-semibold'>{value}</div>
    </div>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('User Information')}
      description={t(
        'View detailed information about this user including balance, usage statistics, and invitation details.'
      )}
      contentClassName='sm:max-w-lg'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      {isLoading ? (
        <div className='flex items-center justify-center py-8'>
          <Loader2 className='text-muted-foreground size-6 animate-spin' />
        </div>
      ) : userInfo ? (
        <div className='space-y-4 py-4'>
          {/* Basic Info */}
          <div className='grid grid-cols-2 gap-4'>
            <InfoItem label={t('Username')} value={userInfo.username} />
            {userInfo.display_name && (
              <InfoItem
                label={t('Display Name')}
                value={userInfo.display_name}
              />
            )}
          </div>

          {/* Balance Info */}
          <div className='grid grid-cols-2 gap-4'>
            <InfoItem
              label={t('Balance')}
              value={formatQuota(userInfo.quota)}
            />
            <InfoItem
              label={t('Used Quota')}
              value={formatQuota(userInfo.used_quota)}
            />
          </div>

          {/* Statistics */}
          <div className='grid grid-cols-2 gap-4'>
            <InfoItem
              label={t('Request Count')}
              value={formatCompactNumber(userInfo.request_count)}
            />
            {userInfo.group && (
              <InfoItem label={t('User Group')} value={userInfo.group} />
            )}
          </div>

          <Separator />

          {/* Windowed usage */}
          {isLoadingStats && (
            <div className='flex items-center justify-center py-4'>
              <Loader2 className='text-muted-foreground size-5 animate-spin' />
            </div>
          )}
          {!isLoadingStats && (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <InfoItem
                  label={t("Today's Usage")}
                  value={formatQuota(today.quota)}
                />
                <InfoItem
                  label={t("Today's Requests")}
                  value={formatCompactNumber(today.requests)}
                />
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <InfoItem
                  label={t("This Month's Usage")}
                  value={formatQuota(month.quota)}
                />
                <InfoItem
                  label={t("This Month's Requests")}
                  value={formatCompactNumber(month.requests)}
                />
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <InfoItem
                  label={t("Today's Failures")}
                  value={formatCompactNumber(today.failures)}
                />
                <InfoItem
                  label={t("This Month's Failures")}
                  value={formatCompactNumber(month.failures)}
                />
              </div>

              {failureReasons.length > 0 && (
                <Collapsible className='rounded-lg border p-3'>
                  <CollapsibleTrigger className='cursor-pointer text-sm font-medium'>
                    {t('Failure Reasons This Month')}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className='mt-3 max-h-[240px] space-y-2 overflow-auto'>
                      {failureReasons.map((reason) => (
                        <div
                          key={reason.name}
                          className='flex items-start justify-between gap-3 text-xs'
                        >
                          <span className='text-muted-foreground break-all'>
                            {reason.name || t('Unknown error')}
                          </span>
                          <span className='shrink-0 font-semibold'>
                            {formatCompactNumber(reason.count)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}

          <Separator />

          {/* Invitation Info */}
          {(userInfo.aff_code ||
            userInfo.aff_count !== undefined ||
            (userInfo.aff_quota !== undefined && userInfo.aff_quota > 0)) && (
            <>
              <div className='grid grid-cols-2 gap-4'>
                {userInfo.aff_code && (
                  <InfoItem
                    label={t('Invitation Code')}
                    value={userInfo.aff_code}
                  />
                )}
                {userInfo.aff_count !== undefined && (
                  <InfoItem
                    label={t('Invited Users')}
                    value={formatCompactNumber(userInfo.aff_count)}
                  />
                )}
              </div>

              {userInfo.aff_quota !== undefined && userInfo.aff_quota > 0 && (
                <InfoItem
                  label={t('Invitation Quota')}
                  value={formatQuota(userInfo.aff_quota)}
                />
              )}
            </>
          )}

          {/* Remark */}
          {userInfo.remark && (
            <div className='space-y-1.5'>
              <Label className='text-muted-foreground text-xs'>
                {t('Remark')}
              </Label>
              <div className='text-sm leading-relaxed font-semibold break-words'>
                {userInfo.remark}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className='text-muted-foreground py-8 text-center text-sm'>
          {t('No user information available')}
        </div>
      )}
    </Dialog>
  )
}
