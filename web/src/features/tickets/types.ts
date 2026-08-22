export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export type TicketStatus =
  | 'open'
  | 'processing'
  | 'replied'
  | 'resolved'
  | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TicketCategory = 'billing' | 'technical' | 'account' | 'other'
export type TicketAuthorRole = 'user' | 'admin'

export interface TicketAttachment {
  name: string
  file: string
  size: number
}

export interface TicketMessage {
  id: number
  ticket_id: number
  author_id: number
  author_role: TicketAuthorRole
  author_name: string
  content: string
  attachments: TicketAttachment[] | null
  created_at: number
}

export interface Ticket {
  id: number
  ticket_no: string
  user_id: number
  username: string
  title: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  last_reply_at: number
  last_reply_role: TicketAuthorRole
  user_unread: boolean
  admin_unread: boolean
  message_count: number
  created_at: number
  updated_at: number
  messages?: TicketMessage[] | null
}

export interface TicketMeta {
  categories: TicketCategory[]
  priorities: TicketPriority[]
  statuses: TicketStatus[]
}

export interface TicketListResponse {
  success: boolean
  message?: string
  data?: {
    items: Ticket[]
    total: number
    page: number
    page_size: number
  }
}

export type TicketStatusCounts = Partial<Record<TicketStatus | 'all', number>>

export type TicketsDialogType = 'create'
