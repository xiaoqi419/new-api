import type { TFunction } from 'i18next'

import type { StatusBadgeProps } from '@/components/status-badge'

import type { TicketCategory, TicketPriority, TicketStatus } from './types'

export const TICKET_STATUSES = [
  'open',
  'processing',
  'replied',
  'resolved',
  'closed',
] as const

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

export const TICKET_CATEGORIES = [
  'billing',
  'technical',
  'account',
  'other',
] as const

export const TICKET_STATUS_LABEL_KEYS: Record<TicketStatus, string> = {
  open: 'Open',
  processing: 'Processing',
  replied: 'Replied',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const TICKET_PRIORITY_LABEL_KEYS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const TICKET_CATEGORY_LABEL_KEYS: Record<TicketCategory, string> = {
  billing: 'Billing',
  technical: 'Technical',
  account: 'Account',
  other: 'Other',
}

export const TICKET_STATUS_VARIANTS: Record<
  TicketStatus,
  StatusBadgeProps['variant']
> = {
  open: 'info',
  processing: 'warning',
  replied: 'success',
  resolved: 'neutral',
  closed: 'neutral',
}

export const TICKET_PRIORITY_VARIANTS: Record<
  TicketPriority,
  StatusBadgeProps['variant']
> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
}

export function getTicketStatusOptions(t: TFunction) {
  return TICKET_STATUSES.map((value) => ({
    label: t(TICKET_STATUS_LABEL_KEYS[value]),
    value,
  }))
}

export function getTicketPriorityOptions(t: TFunction) {
  return TICKET_PRIORITIES.map((value) => ({
    label: t(TICKET_PRIORITY_LABEL_KEYS[value]),
    value,
  }))
}

export function getTicketCategoryOptions(t: TFunction) {
  return TICKET_CATEGORIES.map((value) => ({
    label: t(TICKET_CATEGORY_LABEL_KEYS[value]),
    value,
  }))
}

export const MAX_TICKET_ATTACHMENTS = 6

export const TICKET_SUCCESS = {
  CREATED: 'Ticket created successfully',
  REPLIED: 'Reply sent successfully',
  CLOSED: 'Ticket closed',
  STATUS_UPDATED: 'Status updated',
  PRIORITY_UPDATED: 'Priority updated',
} as const

export const TICKET_ERROR = {
  LOAD_FAILED: 'Failed to load tickets',
  SAVE_FAILED: 'Failed to save ticket',
  UPLOAD_FAILED: 'Failed to upload attachment',
  DOWNLOAD_FAILED: 'Failed to download attachment',
} as const
