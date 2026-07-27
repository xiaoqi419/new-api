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
  InviteRankingRow,
  PageData,
  RebateRecord,
  RebateUser,
} from './types'

export async function getRebateRecords(
  page: number,
  pageSize: number,
  status: string
): Promise<ApiResponse<PageData<RebateRecord>>> {
  const s = status && status !== 'all' ? status : ''
  const res = await api.get(
    `/api/rebate/?p=${page}&page_size=${pageSize}&status=${s}`
  )
  return res.data
}

export async function payRebate(id: number): Promise<ApiResponse<null>> {
  const res = await api.post('/api/rebate/pay', { id })
  return res.data
}

export async function cancelRebate(id: number): Promise<ApiResponse<null>> {
  const res = await api.post('/api/rebate/cancel', { id })
  return res.data
}

export async function getRebateUsers(
  page: number,
  pageSize: number
): Promise<ApiResponse<PageData<RebateUser>>> {
  const res = await api.get(`/api/rebate/users?p=${page}&page_size=${pageSize}`)
  return res.data
}

export async function setUserRebateRatio(
  userId: number,
  ratio: number | null
): Promise<ApiResponse<null>> {
  const res = await api.put('/api/rebate/user_ratio', {
    user_id: userId,
    rebate_ratio: ratio,
  })
  return res.data
}

export async function getInviteRanking(
  page: number,
  pageSize: number
): Promise<ApiResponse<PageData<InviteRankingRow>>> {
  const res = await api.get(
    `/api/rebate/ranking?p=${page}&page_size=${pageSize}`
  )
  return res.data
}
