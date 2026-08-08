import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Markdown } from '@/components/ui/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { usePublicAnnouncements } from '@/hooks/use-public-announcements'
import { formatTimestampToDate } from '@/lib/format'

import {
  ANNOUNCEMENT_TYPE_LABEL_KEYS,
  ANNOUNCEMENT_TYPE_VARIANTS,
} from './constants'
import type { AnnouncementType } from './types'

type TabValue = 'all' | AnnouncementType

export function AnnouncementCenter() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabValue>('all')

  // Shared with the header notification bell so both read one cache entry.
  const { items, loading: isLoading } = usePublicAnnouncements()

  const counts = useMemo(() => {
    const c: Record<TabValue, number> = {
      all: items.length,
      version: 0,
      system: 0,
      activity: 0,
    }
    for (const it of items) c[it.type] = (c[it.type] ?? 0) + 1
    return c
  }, [items])

  const filtered = tab === 'all' ? items : items.filter((i) => i.type === tab)

  const versionTimeline = useMemo(
    () => items.filter((i) => i.type === 'version').slice(0, 20),
    [items]
  )

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
          <div className='flex flex-wrap gap-2'>
            {tabs.map((tb) => (
              <Button
                key={tb.value}
                size='sm'
                variant={tab === tb.value ? 'default' : 'outline'}
                onClick={() => setTab(tb.value)}
              >
                {tb.label}
                <span className='ml-1 text-xs opacity-70'>
                  {counts[tb.value] ?? 0}
                </span>
              </Button>
            ))}
          </div>

          <div className='mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3'>
            <div className='flex flex-col gap-4 lg:col-span-2'>
              {isLoading &&
                ['s1', 's2', 's3'].map((k) => (
                  <Skeleton key={k} className='h-40 w-full rounded-xl' />
                ))}

              {!isLoading && filtered.length === 0 && (
                <Empty className='min-h-64 border'>
                  <EmptyHeader>
                    <EmptyTitle>{t('No announcements yet')}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}

              {!isLoading &&
                filtered.map((ann) => (
                  <Card key={ann.id} className='p-5'>
                    <div className='flex flex-wrap items-center gap-2'>
                      {ann.pinned && (
                        <StatusBadge
                          label={t('Pinned')}
                          variant='danger'
                          copyable={false}
                        />
                      )}
                      <StatusBadge
                        label={t(ANNOUNCEMENT_TYPE_LABEL_KEYS[ann.type])}
                        variant={ANNOUNCEMENT_TYPE_VARIANTS[ann.type]}
                        copyable={false}
                      />
                      {ann.version && (
                        <StatusBadge
                          label={`v${ann.version}`}
                          variant='info'
                          copyable={false}
                        />
                      )}
                      <span className='text-muted-foreground ml-auto text-sm'>
                        {formatTimestampToDate(ann.publish_time)}
                      </span>
                    </div>
                    <h3 className='mt-3 text-lg font-semibold'>{ann.title}</h3>
                    {ann.content && (
                      <div className='text-foreground/90 mt-2 text-sm'>
                        <Markdown>{ann.content}</Markdown>
                      </div>
                    )}
                  </Card>
                ))}
            </div>

            <div className='lg:col-span-1'>
              <Card className='p-5'>
                <h3 className='text-base font-semibold'>
                  {t('Version Timeline')}
                </h3>
                <div className='mt-4 flex flex-col gap-4'>
                  {versionTimeline.length === 0 && (
                    <span className='text-muted-foreground text-sm'>
                      {t('No records')}
                    </span>
                  )}
                  {versionTimeline.map((v) => (
                    <div
                      key={v.id}
                      className='border-border/60 border-l-2 pl-3'
                    >
                      <div className='text-muted-foreground text-xs'>
                        {formatTimestampToDate(v.publish_time)}
                      </div>
                      <div className='text-sm font-medium'>
                        {v.version ? `v${v.version} · ` : ''}
                        {v.title}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
