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
import { Link } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Bell, Megaphone, X } from '@/components/icons'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { getAnnouncementSummary } from '@/features/announcements/lib/announcement-summary'
import type { Announcement } from '@/features/announcements/types'
import type { NotificationTab } from '@/hooks/use-notifications'
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

interface ModalAnnouncementDialogProps {
  open: boolean
  announcement?: Announcement
  queuePosition: number
  queueSize: number
  onCancel: () => void
  onAcknowledge: () => void
}

function getRelativeTime(publishDate: string | Date, t: TFunction): string {
  if (!publishDate) return ''

  const now = new Date()
  const pubDate = new Date(publishDate)
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

  if (diffMs < 0) return formatDateTimeObject(pubDate)
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
  return formatDateTimeObject(pubDate)
}

function EmptyState(props: {
  icon: React.ReactNode
  title: string
  description?: string
}) {
  return (
    <Empty className='min-h-48 border-0 p-4'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>{props.icon}</EmptyMedia>
        <EmptyTitle>{props.title}</EmptyTitle>
        {props.description ? (
          <EmptyDescription>{props.description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  )
}

function CompactAnnouncementList(props: {
  items: Announcement[]
  loading: boolean
  emptyTitle: string
  onNavigate: () => void
  t: TFunction
}) {
  if (props.loading) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title={props.t('Loading...')}
        description={props.t('Latest platform updates and notices')}
      />
    )
  }

  if (props.items.length === 0) {
    return <EmptyState icon={<Megaphone />} title={props.emptyTitle} />
  }

  return (
    <ScrollArea className='h-[min(52vh,28rem)] pr-3'>
      <div className='flex flex-col'>
        {props.items.map((item, index) => {
          const publishDate = item.publish_time
            ? new Date(item.publish_time * 1000)
            : null

          return (
            <div key={item.id}>
              <Link
                to='/announcements/$id'
                params={{ id: String(item.id) }}
                className='hover:bg-muted focus-visible:bg-muted block rounded-md px-2 py-3 transition-colors outline-none'
                onClick={props.onNavigate}
              >
                <div className='flex min-w-0 flex-col gap-1.5'>
                  <span className='truncate text-sm font-medium'>
                    {item.title}
                  </span>
                  {item.content ? (
                    <span className='text-muted-foreground line-clamp-2 text-xs leading-relaxed'>
                      {getAnnouncementSummary(item.content)}
                    </span>
                  ) : null}
                  {publishDate ? (
                    <span className='text-muted-foreground text-xs'>
                      {`${getRelativeTime(publishDate, props.t)} • ${formatDateTimeObject(publishDate)}`}
                    </span>
                  ) : null}
                </div>
              </Link>
              {index < props.items.length - 1 ? <Separator /> : null}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

/**
 * Notification popover listing compact, plain-text announcement summaries.
 */
export function NotificationPopover(props: NotificationPopoverProps) {
  const { t } = useTranslation()
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant='ghost'
            size='icon'
            className={cn('relative size-9', props.className)}
            aria-label={t('Notifications')}
          />
        }
      >
        <Bell className='size-[1.2rem]' />
        {props.unreadCount > 0 ? (
          <span className='bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums'>
            {props.unreadCount > 99 ? '99+' : props.unreadCount}
          </span>
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
          value={props.activeTab}
          onValueChange={props.onTabChange as (value: string) => void}
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
            <CompactAnnouncementList
              items={props.announcements}
              loading={props.loading}
              emptyTitle={t('No system announcements')}
              onNavigate={() => props.onOpenChange(false)}
              t={t}
            />
          </TabsContent>

          <TabsContent value='timeline' className='mt-2'>
            <CompactAnnouncementList
              items={props.versions}
              loading={props.loading}
              emptyTitle={t('No records')}
              onNavigate={() => props.onOpenChange(false)}
              t={t}
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}

/**
 * A single centered surface for the current modal announcement in the queue.
 * Closing through any Dialog primitive path has the same session-only effect
 * as Cancel; persistence happens only through the explicit acknowledgement.
 */
export function ModalAnnouncementDialog(props: ModalAnnouncementDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className='flex max-h-[calc(100svh-2rem)] w-[min(60rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl'
      >
        <DialogHeader className='relative shrink-0 border-b px-4 py-4 pr-12 sm:px-6 sm:py-5'>
          <DialogTitle className='text-lg leading-6 break-words sm:text-xl'>
            {props.announcement?.title}
          </DialogTitle>
          {props.queueSize > 1 ? (
            <span className='text-muted-foreground mt-1 text-xs tabular-nums'>
              {props.queuePosition} / {props.queueSize}
            </span>
          ) : null}
          <DialogClose
            render={
              <Button
                aria-label={t('Close')}
                className='absolute top-3 right-3'
                size='icon-sm'
                variant='ghost'
              />
            }
          >
            <X aria-hidden='true' />
            <span className='sr-only'>{t('Close')}</span>
          </DialogClose>
        </DialogHeader>

        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6'>
          {props.announcement?.content ? (
            <RichContent breaks content={props.announcement.content} />
          ) : null}
        </div>

        <DialogFooter className='mx-0 mb-0 shrink-0 flex-col border-t px-4 py-3 sm:flex-row sm:px-6'>
          <Button variant='outline' onClick={props.onCancel}>
            {t('Cancel')}
          </Button>
          <Button onClick={props.onAcknowledge}>{t('Mark as read')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
