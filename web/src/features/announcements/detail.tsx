import { useQuery } from '@tanstack/react-query'
/*
Copyright (C) 2026 QuantumNous

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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ArrowLeft, CheckCircle2 } from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Markdown } from '@/components/ui/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { modalAnnouncementKey } from '@/hooks/use-public-announcements'
import { formatTimestampToDate } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'

import { getPublicAnnouncementDetail } from './api'
import {
  ANNOUNCEMENT_TYPE_LABEL_KEYS,
  ANNOUNCEMENT_TYPE_VARIANTS,
} from './constants'

type AnnouncementDetailProps = {
  announcementId: number | null
}

export function AnnouncementDetail(props: AnnouncementDetailProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const acknowledgeModal = useNotificationStore(
    (state) => state.acknowledgeModal
  )
  const acknowledgedModalKeys = useNotificationStore(
    (state) => state.acknowledgedModalKeys
  )
  const { data, isLoading } = useQuery({
    queryKey: ['announcements-public-detail', props.announcementId],
    queryFn: () => getPublicAnnouncementDetail(props.announcementId ?? 0),
    enabled: props.announcementId !== null,
  })
  const announcement = data?.success ? data.data : undefined
  const modalKey =
    announcement?.level === 'modal' && user
      ? modalAnnouncementKey(announcement, user.id)
      : undefined
  const isAcknowledged = modalKey
    ? acknowledgedModalKeys.includes(modalKey)
    : false

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Announcements')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-3xl flex-col gap-4'>
          <Link
            to='/announcements'
            className='hover:bg-accent hover:text-accent-foreground inline-flex h-8 w-fit items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors'
          >
            <ArrowLeft data-icon='inline-start' aria-hidden />
            {t('Back to announcements')}
          </Link>

          {isLoading && <Skeleton className='h-96 w-full rounded-xl' />}

          {!isLoading && !announcement && (
            <Empty className='min-h-72 border'>
              <EmptyHeader>
                <EmptyTitle>{t('Announcement unavailable')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {!isLoading && announcement && (
            <Card className='gap-5 p-5 sm:p-7'>
              <header className='flex flex-col gap-4 border-b pb-5'>
                <div className='flex flex-wrap items-center gap-2'>
                  {announcement.pinned && (
                    <StatusBadge
                      label={t('Pinned')}
                      variant='danger'
                      copyable={false}
                    />
                  )}
                  <StatusBadge
                    label={t(ANNOUNCEMENT_TYPE_LABEL_KEYS[announcement.type])}
                    variant={ANNOUNCEMENT_TYPE_VARIANTS[announcement.type]}
                    copyable={false}
                  />
                  {announcement.version && (
                    <StatusBadge
                      label={`v${announcement.version}`}
                      variant='info'
                      copyable={false}
                    />
                  )}
                </div>
                <div>
                  <h1 className='min-w-0 text-2xl leading-tight font-semibold break-words sm:text-3xl'>
                    {announcement.title}
                  </h1>
                  <p className='text-muted-foreground mt-2 text-sm'>
                    {formatTimestampToDate(announcement.publish_time)}
                  </p>
                </div>
              </header>

              <Markdown className='min-w-0 break-words'>
                {announcement.content}
              </Markdown>

              {modalKey && (
                <div className='flex justify-end border-t pt-5'>
                  <Button
                    disabled={isAcknowledged}
                    onClick={() => acknowledgeModal(modalKey)}
                  >
                    <CheckCircle2 data-icon='inline-start' aria-hidden />
                    {t('Mark as read')}
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
