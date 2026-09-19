import { api } from '@/lib/api'

import type {
  Announcement,
  AnnouncementLevel,
  AnnouncementListResponse,
  AnnouncementPage,
  AnnouncementType,
  ApiResponse,
} from './types'

// 公开：已发布公告列表
export async function getPublicAnnouncements(
  type?: string
): Promise<ApiResponse<Announcement[]>> {
  const q = type ? `?type=${encodeURIComponent(type)}` : ''
  const res = await api.get(`/api/announcements${q}`)
  return res.data
}

type PublicAnnouncementsPageParams = {
  level?: AnnouncementLevel
  p?: number
  page_size?: number
  type?: AnnouncementType
}

// Public history uses the same endpoint as the header cache, but pagination
// keeps the center from silently dropping older announcements.
export async function getPublicAnnouncementsPage(
  params: PublicAnnouncementsPageParams = {}
): Promise<ApiResponse<AnnouncementPage>> {
  const { p = 1, page_size = 20, type, level } = params
  const query = new URLSearchParams({
    p: String(p),
    page_size: String(page_size),
  })

  if (type) query.set('type', type)
  if (level) query.set('level', level)

  const res = await api.get(`/api/announcements?${query.toString()}`)
  return res.data
}

export async function getPublicAnnouncementDetail(
  id: number
): Promise<ApiResponse<Announcement>> {
  const res = await api.get(`/api/announcements/detail/${id}`)
  return res.data
}

// 管理端：分页列表（含草稿）
export async function adminListAnnouncements(
  params: { p?: number; page_size?: number; type?: string } = {}
): Promise<AnnouncementListResponse> {
  const { p = 1, page_size = 10, type = '' } = params
  const qp = new URLSearchParams()
  qp.set('p', String(p))
  qp.set('page_size', String(page_size))
  if (type) qp.set('type', type)
  const res = await api.get(`/api/announcement/?${qp.toString()}`)
  return res.data
}

export async function createAnnouncement(
  data: Partial<Announcement>
): Promise<ApiResponse<Announcement>> {
  const res = await api.post('/api/announcement/', data)
  return res.data
}

export async function updateAnnouncement(
  data: Partial<Announcement> & { id: number }
): Promise<ApiResponse<Announcement>> {
  const res = await api.put('/api/announcement/', data)
  return res.data
}

export async function deleteAnnouncement(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/announcement/${id}`)
  return res.data
}
