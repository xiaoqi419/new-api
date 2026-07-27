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
  IdentitySubmitData,
  IdentityVerification,
  IdentityVerifyConfig,
  IdentityVerifyTypesResponse,
  PageInfo,
} from './types'

// ============================================================================
// Identity Verification API (user-side)
// ============================================================================

/** Open identity types plus the global enabled flag (for the submit form). */
export async function getIdentityTypes(): Promise<
  ApiResponse<IdentityVerifyTypesResponse>
> {
  const res = await api.get('/api/identity_verification/types')
  return res.data
}

/** Current user's identity verification requests (paginated). */
export async function getSelfIdentityVerifications(
  p: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<IdentityVerification>>> {
  const res = await api.get(
    `/api/identity_verification/self?p=${p}&page_size=${pageSize}`
  )
  return res.data
}

/** Submit an identity verification request with a proof file. */
export async function submitIdentityVerification(
  data: IdentitySubmitData
): Promise<ApiResponse<IdentityVerification>> {
  const formData = new FormData()
  formData.append('type_key', data.type_key)
  formData.append('real_name', data.real_name)
  formData.append('org', data.org)
  formData.append('extra', data.extra)
  formData.append('file', data.file)
  const res = await api.post('/api/identity_verification/', formData)
  return res.data
}

// ============================================================================
// Identity Verification API (admin-side)
// ============================================================================

/** All requests, optionally filtered by status (-1 = all). */
export async function getAllIdentityVerifications(
  status: number,
  p: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<IdentityVerification>>> {
  const statusQuery = status >= 0 ? `&status=${status}` : ''
  const res = await api.get(
    `/api/identity_verification/admin/?p=${p}&page_size=${pageSize}${statusQuery}`
  )
  return res.data
}

/** Approve a request and auto-grant the configured quota. */
export async function approveIdentityVerification(
  id: number
): Promise<ApiResponse<IdentityVerification>> {
  const res = await api.post(`/api/identity_verification/admin/${id}/approve`)
  return res.data
}

/** Reject a request with a reason. */
export async function rejectIdentityVerification(
  id: number,
  reason: string
): Promise<ApiResponse<IdentityVerification>> {
  const res = await api.post(`/api/identity_verification/admin/${id}/reject`, {
    reason,
  })
  return res.data
}

/** Read the identity verification config (enabled flag + type list). */
export async function getIdentityConfig(): Promise<
  ApiResponse<IdentityVerifyConfig>
> {
  const res = await api.get('/api/identity_verification/admin/config')
  return res.data
}

/** Persist the identity verification config. */
export async function saveIdentityConfig(
  config: IdentityVerifyConfig
): Promise<ApiResponse<IdentityVerifyConfig>> {
  const res = await api.put('/api/identity_verification/admin/config', config)
  return res.data
}

// ============================================================================
// Proof viewing
// ============================================================================

/** Open a proof file (image/PDF) inline in a new tab via a temporary URL. */
export async function viewIdentityProof(id: number): Promise<void> {
  const res = await api.get(`/api/identity_verification/proof/${id}`, {
    responseType: 'blob',
    skipErrorHandler: true,
  })
  const blob = res.data as Blob
  const url = window.URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => window.URL.revokeObjectURL(url), 60000)
}
