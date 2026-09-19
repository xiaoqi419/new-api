import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ChevronLeft, ChevronRight } from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTimestampToDate } from '@/lib/format'

import { getPublicAnnouncementsPage } from './api'
import {
  ANNOUNCEMENT_ERROR,
  ANNOUNCEMENT_TYPE_LABEL_KEYS,
  ANNOUNCEMENT_TYPE_VARIANTS,
} from './constants'
import { getAnnouncementSummary } from './lib/announcement-summary'
import type { AnnouncementType } from './types'

type TabValue = 'all' | AnnouncementType

const PAGE_SIZE = 20

export function AnnouncementCenter() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabValue>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['announcements-public-page', page, tab],
    queryFn: () =>
      getPublicAnnouncementsPage({
        p: page,
        page_size: PAGE_SIZE,
        type: tab === 'all' ? undefined : tab,
      }),
  })

  const announcementPage = data?.success ? data.data : undefined
  const loadFailed = isError || data?.success === false
  const items = useMemo(() => {
    const pageItems = announcementPage?.items ?? []
    return [...pageItems].sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
      return right.publish_time - left.publish_time
    })
  }, [announcementPage?.items])
  const total = announcementPage?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const tabs: { value: TabValue; label: string }[] = [
    { value: 'all', label: t('All') },
    { value: 'version', label: t('Release Notes') },
    { value: 'system', label: t('System Notice') },
    { value: 'activity', label: t('Activity') },
  ]

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Announcements')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto w-full max-w-5xl'>
          <div className='flex flex-wrap gap-2' aria-label={t('Category')}>
            {tabs.map((tb) => (
              <Button
                key={tb.value}
                size='sm'
                variant={tab === tb.value ? 'default' : 'outline'}
                aria-pressed={tab === tb.value}
                onClick={() => {
                  setTab(tb.value)
                  setPage(1)
                }}
              >
                {tb.label}
              </Button>
            ))}
          </div>

          <div className='mt-4 flex flex-col gap-4'>
            {isLoading &&
              ['s1', 's2', 's3'].map((key) => (
                <Skeleton key={key} className='h-36 w-full rounded-xl' />
              ))}

            {!isLoading && loadFailed && (
              <Empty className='min-h-64 border'>
                <EmptyHeader>
                  <EmptyTitle>
                    {data?.message || t(ANNOUNCEMENT_ERROR.LOAD_FAILED)}
                  </EmptyTitle>
                </EmptyHeader>
                <Button variant='outline' onClick={() => void refetch()}>
                  {t('Retry')}
                </Button>
              </Empty>
            )}

            {!isLoading && !loadFailed && items.length === 0 && (
              <Empty className='min-h-64 border'>
                <EmptyHeader>
                  <EmptyTitle>{t('No announcements yet')}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}

            {!loadFailed &&
              items.map((announcement) => (
                <Card key={announcement.id} className='gap-3 p-5'>
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
                    <span className='text-muted-foreground ml-auto text-sm'>
                      {formatTimestampToDate(announcement.publish_time)}
                    </span>
                  </div>
                  <h3 className='text-lg font-semibold'>
                    <Link
                      to='/announcements/$id'
                      params={{ id: String(announcement.id) }}
                      className='hover:text-primary break-words transition-colors'
                    >
                      {announcement.title}
                    </Link>
                  </h3>
                  {announcement.content && (
                    <p className='text-muted-foreground line-clamp-2 text-sm'>
                      {getAnnouncementSummary(announcement.content)}
                    </p>
                  )}
                </Card>
              ))}

            {!loadFailed && totalPages > 1 && (
              <nav
                className='flex items-center justify-center gap-3 pt-1'
                aria-label={t('Pagination')}
              >
                <Button
                  size='icon'
                  variant='outline'
                  aria-label={t('Previous')}
                  disabled={page === 1 || isFetching}
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ChevronLeft aria-hidden />
                </Button>
                <span className='text-muted-foreground min-w-24 text-center text-sm'>
                  {t('Page {{page}} of {{pages}}', { page, pages: totalPages })}
                </span>
                <Button
                  size='icon'
                  variant='outline'
                  aria-label={t('Next')}
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ChevronRight aria-hidden />
                </Button>
              </nav>
            )}
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
