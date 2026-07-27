import type { TFunction } from 'i18next'

import type { StatusBadgeProps } from '@/components/status-badge'

import type { AnnouncementLevel, AnnouncementType } from './types'

export const ANNOUNCEMENT_TYPES = ['version', 'system', 'activity'] as const

export const ANNOUNCEMENT_LEVELS = [
  'default',
  'success',
  'warning',
  'error',
] as const

export const ANNOUNCEMENT_TYPE_LABEL_KEYS: Record<AnnouncementType, string> = {
  version: 'Release Notes',
  system: 'System Notice',
  activity: 'Activity',
}

export const ANNOUNCEMENT_LEVEL_LABEL_KEYS: Record<AnnouncementLevel, string> = {
  default: 'Default',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
}

export const ANNOUNCEMENT_LEVEL_VARIANTS: Record<
  AnnouncementLevel,
  StatusBadgeProps['variant']
> = {
  default: 'neutral',
  success: 'success',
  warning: 'warning',
  error: 'danger',
}

export const ANNOUNCEMENT_TYPE_VARIANTS: Record<
  AnnouncementType,
  StatusBadgeProps['variant']
> = {
  version: 'info',
  system: 'neutral',
  activity: 'success',
}

export function getAnnouncementTypeOptions(t: TFunction) {
  return ANNOUNCEMENT_TYPES.map((value) => ({
    label: t(ANNOUNCEMENT_TYPE_LABEL_KEYS[value]),
    value,
  }))
}

export function getAnnouncementLevelOptions(t: TFunction) {
  return ANNOUNCEMENT_LEVELS.map((value) => ({
    label: t(ANNOUNCEMENT_LEVEL_LABEL_KEYS[value]),
    value,
  }))
}

export const ANNOUNCEMENT_SUCCESS = {
  CREATED: 'Announcement created successfully',
  UPDATED: 'Announcement updated successfully',
  DELETED: 'Announcement deleted successfully',
} as const

export const ANNOUNCEMENT_ERROR = {
  LOAD_FAILED: 'Failed to load announcements',
  SAVE_FAILED: 'Failed to save announcement',
  DELETE_FAILED: 'Failed to delete announcement',
} as const
