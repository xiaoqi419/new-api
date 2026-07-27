/*
Copyright (C) 2023-2026 QuantumNous

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
  CreateGroupBuyRequest,
  GroupBuyDetail,
  GroupBuyInfo,
  HallData,
  JoinGroupBuyRequest,
  PayInfo,
  PaymentResultData,
  TradeStatusData,
} from './types'

// ============================================================================
// Group Buy API (user-side)
// ============================================================================

/** Launchable packages + whether the feature is enabled. */
export async function getGroupBuyInfo(): Promise<ApiResponse<GroupBuyInfo>> {
  const res = await api.get('/api/user/groupbuy/info')
  return res.data
}

/** Paginated hall listing of active groups. */
export async function getGroupBuyHall(
  page: number,
  pageSize: number
): Promise<ApiResponse<HallData>> {
  const res = await api.get(
    `/api/user/groupbuy/hall?p=${page}&page_size=${pageSize}`
  )
  return res.data
}

/** Full detail for a single group by its number. */
export async function getGroupBuyDetail(
  no: string
): Promise<ApiResponse<GroupBuyDetail>> {
  const res = await api.get(
    `/api/user/groupbuy/detail?no=${encodeURIComponent(no)}`
  )
  return res.data
}

/** Payment channels enabled for topup (reused for group-buy checkout). */
export async function getPayInfo(): Promise<ApiResponse<PayInfo>> {
  const res = await api.get('/api/user/topup/info')
  return res.data
}

/** Launch a new group from a package. Business errors handled by caller. */
export async function createGroupBuy(
  req: CreateGroupBuyRequest
): Promise<ApiResponse<PaymentResultData | string>> {
  const res = await api.post('/api/user/groupbuy/create', req, {
    skipBusinessError: true,
  })
  return res.data
}

/** Join an existing group. Business errors handled by caller. */
export async function joinGroupBuy(
  req: JoinGroupBuyRequest
): Promise<ApiResponse<PaymentResultData | string>> {
  const res = await api.post('/api/user/groupbuy/join', req, {
    skipBusinessError: true,
  })
  return res.data
}

/** Poll a WeChat/Alipay trade status by trade number. */
export async function getTradeStatus(
  tradeNo: string
): Promise<ApiResponse<TradeStatusData>> {
  const res = await api.get(
    `/api/user/topup/status?trade_no=${encodeURIComponent(tradeNo)}`,
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return res.data
}
