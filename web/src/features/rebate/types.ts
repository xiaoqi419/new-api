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
export interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
}

export interface PageData<T> {
  page: number
  page_size: number
  total: number
  items: T[]
}

export interface RebateRecord {
  id: number
  inviter_id: number
  invitee_id: number
  topup_quota: number
  rebate_ratio: number
  rebate_quota: number
  status: string
  create_time: number
  pay_time?: number
  remark?: string
}

export interface RebateUser {
  id: number
  username: string
  display_name?: string
  aff_count: number
  rebate_ratio?: number | null
}

export interface InviteRankingRow {
  user_id: number
  username: string
  display_name?: string
  aff_count: number
  aff_quota: number
  rebate_pending: number
  rebate_paid: number
  rebate_total: number
}
