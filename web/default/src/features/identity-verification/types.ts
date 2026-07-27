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
// Identity Verification Type Definitions
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

/** Verification status: 0 pending, 1 approved, 2 rejected. */
export type IdentityStatus = 0 | 1 | 2

/** An admin-configured identity type (teacher/medical/student/custom). */
export interface IdentityType {
  key: string
  name: string
  quota: number
  enabled: boolean
}

/** Response of the open types endpoint used by the submit form. */
export interface IdentityVerifyTypesResponse {
  enabled: boolean
  types: IdentityType[]
}

/** An identity verification request record. */
export interface IdentityVerification {
  id: number
  user_id?: number
  username?: string
  type_key?: string
  type_name?: string
  real_name?: string
  org?: string
  extra?: string
  proof_file?: string
  status?: IdentityStatus
  granted_quota?: number
  reject_reason?: string
  created_time?: number
  processed_time?: number
  processed_by?: number
}

/** Admin-editable identity verification config. */
export interface IdentityVerifyConfig {
  enabled: boolean
  types: IdentityType[]
}

/** Payload submitted when applying for identity verification. */
export interface IdentitySubmitData {
  type_key: string
  real_name: string
  org: string
  extra: string
  file: File
}
