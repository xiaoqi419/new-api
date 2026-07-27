export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export type AnnouncementType = 'version' | 'system' | 'activity'
export type AnnouncementLevel = 'default' | 'success' | 'warning' | 'error'

export interface Announcement {
  id: number
  title: string
  content: string
  type: AnnouncementType
  level: AnnouncementLevel
  version: string
  pinned: boolean
  published: boolean
  publish_time: number
  created_at: number
  updated_at: number
}

export interface AnnouncementListResponse {
  success: boolean
  message?: string
  data?: {
    items: Announcement[]
    total: number
    page: number
    page_size: number
  }
}

export type AnnouncementsDialogType = 'create' | 'update' | 'delete'
