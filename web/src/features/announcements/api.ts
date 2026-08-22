import { api } from '@/lib/api'

import type {
  Announcement,
  AnnouncementListResponse,
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
