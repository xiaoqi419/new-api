import type { TFunction } from 'i18next'
import { z } from 'zod'

import type { Announcement } from '../types'

export function getAnnouncementFormSchema(t: TFunction) {
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, t('Title is required'))
      .max(255, t('Title is too long')),
    content: z.string(),
    type: z.enum(['version', 'system', 'activity']),
    level: z.enum(['default', 'success', 'warning', 'error']),
    version: z.string(),
    pinned: z.boolean(),
    published: z.boolean(),
    publish_time: z.number(),
  })
}

export type AnnouncementFormValues = z.infer<
  ReturnType<typeof getAnnouncementFormSchema>
>

export const ANNOUNCEMENT_FORM_DEFAULT_VALUES: AnnouncementFormValues = {
  title: '',
  content: '',
  type: 'system',
  level: 'default',
  version: '',
  pinned: false,
  published: true,
  publish_time: Math.floor(Date.now() / 1000),
}

export function transformAnnouncementToFormDefaults(
  a: Announcement
): AnnouncementFormValues {
  return {
    title: a.title,
    content: a.content ?? '',
    type: a.type,
    level: a.level,
    version: a.version ?? '',
    pinned: a.pinned,
    published: a.published,
    publish_time: a.publish_time || Math.floor(Date.now() / 1000),
  }
}

export function transformFormDataToPayload(data: AnnouncementFormValues) {
  return {
    title: data.title.trim(),
    content: data.content ?? '',
    type: data.type,
    level: data.level,
    version: data.version?.trim() ?? '',
    pinned: data.pinned,
    published: data.published,
    publish_time: data.publish_time,
  }
}
