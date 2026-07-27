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
  LotteryConfig,
  LotteryDrawRecord,
  LotteryStatus,
  PageInfo,
} from './types'

// ============================================================================
// Lottery API (user-side)
// ============================================================================

export async function getLotteryStatus(): Promise<ApiResponse<LotteryStatus>> {
  const res = await api.get('/api/lottery/status')
  return res.data
}

export async function drawLottery(): Promise<ApiResponse<LotteryDrawRecord>> {
  const res = await api.post('/api/lottery/draw')
  return res.data
}

export async function getSelfLotteryRecords(
  p: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<LotteryDrawRecord>>> {
  const res = await api.get(`/api/lottery/records?p=${p}&page_size=${pageSize}`)
  return res.data
}

// ============================================================================
// Lottery API (admin-side)
// ============================================================================

export async function getAllLotteryRecords(
  p: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<LotteryDrawRecord>>> {
  const res = await api.get(
    `/api/lottery/admin/records?p=${p}&page_size=${pageSize}`
  )
  return res.data
}

export async function grantLotteryCards(
  userId: number,
  count: number
): Promise<ApiResponse<unknown>> {
  const res = await api.post('/api/lottery/admin/grant', {
    user_id: userId,
    count,
  })
  return res.data
}

export async function getLotteryConfig(): Promise<ApiResponse<LotteryConfig>> {
  const res = await api.get('/api/lottery/admin/config')
  return res.data
}

export async function saveLotteryConfig(
  config: LotteryConfig
): Promise<ApiResponse<LotteryConfig>> {
  const res = await api.put('/api/lottery/admin/config', config)
  return res.data
}
