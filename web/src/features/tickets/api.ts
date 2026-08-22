import { api } from '@/lib/api'

import type {
  ApiResponse,
  Ticket,
  TicketAttachment,
  TicketListResponse,
  TicketMeta,
  TicketStatusCounts,
} from './types'

// ---------------- user ----------------

export async function getTicketMeta(): Promise<ApiResponse<TicketMeta>> {
  const res = await api.get('/api/ticket/meta')
  return res.data
}

export async function getSelfTickets(
  params: {
    p?: number
    page_size?: number
    status?: string
    category?: string
  } = {}
): Promise<TicketListResponse> {
  const { p = 1, page_size = 10, status = '', category = '' } = params
  const qp = new URLSearchParams()
  qp.set('p', String(p))
  qp.set('page_size', String(page_size))
  if (status) qp.set('status', status)
  if (category) qp.set('category', category)
  const res = await api.get(`/api/ticket/self?${qp.toString()}`)
  return res.data
}

export async function createTicket(data: {
  title: string
  category: string
  priority: string
  content: string
  attachments: TicketAttachment[]
}): Promise<ApiResponse<Ticket>> {
  const res = await api.post('/api/ticket/', data)
  return res.data
}

export async function getTicketDetail(
  id: number
): Promise<ApiResponse<Ticket>> {
  const res = await api.get(`/api/ticket/detail/${id}`)
  return res.data
}

export async function replyTicket(
  id: number,
  data: { content: string; attachments: TicketAttachment[] }
): Promise<ApiResponse<Ticket>> {
  const res = await api.post(`/api/ticket/reply/${id}`, data)
  return res.data
}

export async function closeTicket(id: number): Promise<ApiResponse> {
  const res = await api.post(`/api/ticket/close/${id}`)
  return res.data
}

export async function uploadTicketAttachment(
  file: File
): Promise<ApiResponse<TicketAttachment>> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/api/ticket/attachment', formData)
  return res.data
}

export async function downloadTicketAttachment(
  ticketId: number,
  file: string,
  name: string
): Promise<void> {
  const res = await api.get(
    `/api/ticket/attachment/${ticketId}/${encodeURIComponent(file)}`,
    { responseType: 'blob' }
  )
  const blob = res.data as Blob
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name || file
  document.body.append(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

// ---------------- admin ----------------

export async function adminListTickets(
  params: {
    p?: number
    page_size?: number
    status?: string
    category?: string
    priority?: string
    keyword?: string
  } = {}
): Promise<TicketListResponse> {
  const {
    p = 1,
    page_size = 10,
    status = '',
    category = '',
    priority = '',
    keyword = '',
  } = params
  const qp = new URLSearchParams()
  qp.set('p', String(p))
  qp.set('page_size', String(page_size))
  if (status) qp.set('status', status)
  if (category) qp.set('category', category)
  if (priority) qp.set('priority', priority)
  if (keyword) qp.set('keyword', keyword)
  const res = await api.get(`/api/ticket/admin/?${qp.toString()}`)
  return res.data
}

export async function adminTicketStats(): Promise<
  ApiResponse<TicketStatusCounts>
> {
  const res = await api.get('/api/ticket/admin/stats')
  return res.data
}

export async function adminGetTicketDetail(
  id: number
): Promise<ApiResponse<Ticket>> {
  const res = await api.get(`/api/ticket/admin/detail/${id}`)
  return res.data
}

export async function adminReplyTicket(
  id: number,
  data: { content: string; attachments: TicketAttachment[] }
): Promise<ApiResponse<Ticket>> {
  const res = await api.post(`/api/ticket/admin/reply/${id}`, data)
  return res.data
}

export async function adminUpdateTicketStatus(
  id: number,
  status: string
): Promise<ApiResponse> {
  const res = await api.put(`/api/ticket/admin/status/${id}`, { status })
  return res.data
}

export async function adminUpdateTicketPriority(
  id: number,
  priority: string
): Promise<ApiResponse> {
  const res = await api.put(`/api/ticket/admin/priority/${id}`, { priority })
  return res.data
}
