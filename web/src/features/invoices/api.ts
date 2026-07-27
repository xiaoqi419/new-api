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
import { api } from '@/lib/api'

import type {
  ApiResponse,
  EligibleOrder,
  Invoice,
  InvoiceFormData,
  PageInfo,
} from './types'

// ============================================================================
// Invoice API (user-side)
// ============================================================================

/** Paid top-up orders that can still be invoiced. */
export async function getEligibleOrders(): Promise<
  ApiResponse<EligibleOrder[]>
> {
  const res = await api.get('/api/invoice/eligible_orders')
  return res.data
}

/** Current user's invoice requests (paginated). */
export async function getSelfInvoices(
  p: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<Invoice>>> {
  const res = await api.get(`/api/invoice/self?p=${p}&page_size=${pageSize}`)
  return res.data
}

/** Submit an invoice request for selected orders. */
export async function submitInvoice(
  data: InvoiceFormData
): Promise<ApiResponse<Invoice>> {
  const res = await api.post('/api/invoice/', data)
  return res.data
}

// ============================================================================
// Invoice API (admin-side)
// ============================================================================

/** All invoice requests, optionally filtered by status (-1 = all). */
export async function getAllInvoices(
  status: number,
  p: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<Invoice>>> {
  const statusQuery = status >= 0 ? `&status=${status}` : ''
  const res = await api.get(
    `/api/invoice/admin/?p=${p}&page_size=${pageSize}${statusQuery}`
  )
  return res.data
}

/** Upload the issued PDF and mark an invoice as issued. */
export async function issueInvoice(
  id: number,
  file: File
): Promise<ApiResponse<Invoice>> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post(`/api/invoice/admin/${id}/issue`, formData)
  return res.data
}

/** Reject an invoice request with a reason. */
export async function rejectInvoice(
  id: number,
  reason: string
): Promise<ApiResponse<Invoice>> {
  const res = await api.post(`/api/invoice/admin/${id}/reject`, { reason })
  return res.data
}

// ============================================================================
// Download
// ============================================================================

/** Download an issued invoice PDF via a temporary object URL. */
export async function downloadInvoice(id: number): Promise<void> {
  const res = await api.get(`/api/invoice/download/${id}`, {
    responseType: 'blob',
    skipErrorHandler: true,
  })
  const blob = res.data as Blob
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `invoice_${id}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
