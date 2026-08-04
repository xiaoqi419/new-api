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
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Bell, Megaphone } from '@/components/icons'
import { RichContent } from '@/components/rich-content'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ANNOUNCEMENT_TYPE_LABEL_KEYS,
  ANNOUNCEMENT_TYPE_VARIANTS,
} from '@/features/announcements/constants'
import type { Announcement } from '@/features/announcements/types'
import type { NotificationTab } from '@/hooks/use-notifications'
import { getAnnouncementColorClass } from '@/lib/colors'
import { formatDateTimeObject } from '@/lib/time'
import { cn } from '@/lib/utils'

interface NotificationPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  unreadCount: number
  activeTab: NotificationTab
  onTabChange: (tab: NotificationTab) => void
  announcements: Announcement[]
  versions: Announcement[]
  loading: boolean
  className?: string
}

/**
 * Get relative time string from a date
 */
function getRelativeTime(publishDate: string | Date, t: TFunction): string {
  if (!publishDate) return ''

  const now = new Date()
  const pubDate = new Date(publishDate)

  // If invalid date, return original string
  if (Number.isNaN(pubDate.getTime())) {
    return typeof publishDate === 'string' ? publishDate : ''
  }

  const diffMs = now.getTime() - pubDate.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  // If future time, show specific date
  if (diffMs < 0) return formatDateTimeObject(pubDate)

  // Return relative time based on difference
  if (diffSeconds < 60) return t('Just now')
  if (diffMinutes < 60) {
    return diffMinutes === 1
      ? t('1 minute ago')
      : t('{{count}} minutes ago', { count: diffMinutes })
  }
  if (diffHours < 24) {
    return diffHours === 1
      ? t('1 hour ago')
      : t('{{count}} hours ago', { count: diffHours })
  }
  if (diffDays < 7) {
    return diffDays === 1
      ? t('1 day ago')
      : t('{{count}} days ago', { count: diffDays })
  }
  if (diffWeeks < 4) {
    return diffWeeks === 1
      ? t('1 week ago')
      : t('{{count}} weeks ago', { count: diffWeeks })
  }
  if (diffMonths < 12) {
    return diffMonths === 1
      ? t('1 month ago')
      : t('{{count}} months ago', { count: diffMonths })
  }
  if (diffYears < 2) return t('1 year ago')

  // Over 2 years, show specific date
  return formatDateTimeObject(pubDate)
}

/**
 * Announcement status dot indicator. Driven by level, not type: the shared
 * color map speaks in severity (default/success/warning/error), while an
 * announcement's type says where it belongs (release notes / notice / activity).
 */
function AnnouncementDot({ level }: { level?: string }) {
  return (
    <span
      className={cn(
        'mt-1.5 inline-block size-2 shrink-0 rounded-full',
        getAnnouncementColorClass(level)
      )}
    />
  )
}

/**
 * Empty state component
 */
function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description?: string
}) {
  return (
    <Empty className='min-h-48 border-0 p-4'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  )
}

/**
 * Announcements tab content
 */
function AnnouncementsContent({
  announcements,
  loading,
  t,
}: {
  announcements: Announcement[]
  loading: boolean
  t: TFunction
}) {
  if (loading) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title={t('Loading...')}
        description={t('Latest platform updates and notices')}
      />
    )
  }

  if (announcements.length === 0) {
    return (
      <EmptyState icon={<Megaphone />} title={t('No system announcements')} />
    )
  }

  return (
    <ScrollArea className='h-[min(52vh,28rem)] pr-3'>
      <div className='flex flex-col'>
        {announcements.map((item, idx) => {
          const publishDate = item.publish_time
            ? new Date(item.publish_time * 1000)
            : null

          return (
            <div key={item.id}>
              <div className='py-3'>
                <div className='flex items-start gap-3'>
                  <AnnouncementDot level={item.level} />
                  <div className='flex min-w-0 flex-1 flex-col gap-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='text-sm font-medium'>{item.title}</span>
                      <StatusBadge
                        label={t(ANNOUNCEMENT_TYPE_LABEL_KEYS[item.type])}
                        variant={ANNOUNCEMENT_TYPE_VARIANTS[item.type]}
                        copyable={false}
                      />
                      {item.pinned ? (
                        <StatusBadge
                          label={t('Pinned')}
                          variant='warning'
                          copyable={false}
                        />
                      ) : null}
                    </div>

                    {item.content ? (
                      <div className='text-sm'>
                        <RichContent breaks content={item.content} />
                      </div>
                    ) : null}

                    {publishDate ? (
                      <div className='text-muted-foreground text-xs'>
                        {`${getRelativeTime(publishDate, t)} • ${formatDateTimeObject(publishDate)}`}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              {idx < announcements.length - 1 ? <Separator /> : null}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

/**
 * Version timeline tab content
 */
function TimelineContent({
  versions,
  loading,
  t,
}: {
  versions: Announcement[]
  loading: boolean
  t: TFunction
}) {
  if (loading) {
    return (
      <EmptyState
        icon={<Bell />}
        title={t('Loading...')}
        description={t('Latest platform updates and notices')}
      />
    )
  }

  if (versions.length === 0) {
    return <EmptyState icon={<Bell />} title={t('No records')} />
  }

  return (
    <ScrollArea className='h-[min(52vh,28rem)] pr-3'>
      <div className='flex flex-col gap-3'>
        {versions.map((item) => (
          <div key={item.id} className='flex items-start gap-3'>
            <AnnouncementDot level={item.level} />
            <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='font-mono text-sm font-medium'>
                  {item.version}
                </span>
                <span className='text-muted-foreground truncate text-xs'>
                  {item.title}
                </span>
              </div>
              {item.publish_time ? (
                <span className='text-muted-foreground text-xs'>
                  {formatDateTimeObject(new Date(item.publish_time * 1000))}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

/**
 * Notification popover listing published announcements plus a version timeline
 */
export function NotificationPopover({
  open,
  onOpenChange,
  unreadCount,
  activeTab,
  onTabChange,
  announcements,
  versions,
  loading,
  className,
}: NotificationPopoverProps) {
  const { t } = useTranslation()
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant='ghost'
            size='icon'
            className={cn('relative size-9', className)}
            aria-label={t('Notifications')}
          />
        }
      >
        <Bell className='size-[1.2rem]' />
        {unreadCount > 0 ? (
          <Badge
            variant='destructive'
            className='absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center px-1 text-[10px] font-semibold tabular-nums'
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        ) : null}
      </PopoverTrigger>

      <PopoverContent
        align='end'
        sideOffset={8}
        className='w-[min(26rem,calc(100vw-1rem))] gap-3 p-3'
      >
        <PopoverHeader className='gap-1 px-1'>
          <PopoverTitle>{t('System Announcements')}</PopoverTitle>
          <p className='text-muted-foreground text-xs'>
            {t('Latest platform updates and notices')}
          </p>
        </PopoverHeader>

        <Tabs
          value={activeTab}
          onValueChange={onTabChange as (value: string) => void}
        >
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='announcements' className='gap-1.5'>
              <Megaphone className='size-3.5' />
              {t('Announcements')}
            </TabsTrigger>
            <TabsTrigger value='timeline' className='gap-1.5'>
              <Bell className='size-3.5' />
              {t('Timeline')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value='announcements' className='mt-2'>
            <AnnouncementsContent
              announcements={announcements}
              loading={loading}
              t={t}
            />
          </TabsContent>

          <TabsContent value='timeline' className='mt-2'>
            <TimelineContent versions={versions} loading={loading} t={t} />
          </TabsContent>
        </Tabs>

        <div className='flex justify-end'>
          <Button size='sm' onClick={() => onOpenChange(false)}>
            {t('Close')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
