/*
Copyright (C) 2025 QuantumNous

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
// ============================================================================
// Invoice Type Definitions
// ============================================================================

export interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

export interface PageInfo<T> {
  page?: number
  page_size?: number
  total: number
  items: T[]
}

/** Invoice status: 0 pending, 1 issued, 2 rejected. */
export type InvoiceStatus = 0 | 1 | 2

/** Title type: 1 personal, 2 company. */
export type TitleType = 1 | 2

/** An invoice request record. */
export interface Invoice {
  id: number
  user_id?: number
  username?: string
  amount?: string
  order_ids?: string
  title_type?: TitleType
  title?: string
  tax_number?: string
  email?: string
  remark?: string
  status?: InvoiceStatus
  invoice_file?: string
  reject_reason?: string
  created_time?: number
  processed_time?: number
  processed_by?: number
}

/** A top-up order eligible for invoicing. */
export interface EligibleOrder {
  id: number
  trade_no?: string
  money?: number
  complete_time?: number
  payment_method?: string
}

/** Payload submitted when applying for an invoice. */
export interface InvoiceFormData {
  order_ids: number[]
  title_type: TitleType
  title: string
  tax_number: string
  email: string
  remark: string
}
