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
  AdminGroupBuyParticipant,
  ApiResponse,
  GroupBuyOrder,
  GroupBuyPackage,
  OrderDetailData,
  PackageFormData,
  PageInfo,
  SubscriptionPlanOption,
} from './types'

// ============================================================================
// Group Buy API (admin-side)
// ============================================================================

/** List every configured package (enabled and disabled). */
export async function listPackages(): Promise<ApiResponse<GroupBuyPackage[]>> {
  const res = await api.get('/api/group_buy/packages')
  return res.data
}

/** Create a package. Backend validation errors surface via the interceptor. */
export async function createPackage(
  data: PackageFormData
): Promise<ApiResponse<GroupBuyPackage>> {
  const res = await api.post('/api/group_buy/packages', data)
  return res.data
}

/** Update an existing package. */
export async function updatePackage(
  data: PackageFormData & { id: number }
): Promise<ApiResponse<GroupBuyPackage>> {
  const res = await api.put('/api/group_buy/packages', data)
  return res.data
}

/** Delete a package by id. */
export async function deletePackage(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/group_buy/packages/${id}`)
  return res.data
}

/** Subscription plans (admin) available to bind as a group-buy reward. */
export async function listSubscriptionPlans(): Promise<
  ApiResponse<SubscriptionPlanOption[]>
> {
  const res = await api.get('/api/subscription/admin/plans')
  return res.data
}

/** Paginated group-buy orders, optionally filtered by status. */
export async function listOrders(
  status: string,
  p: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<GroupBuyOrder>>> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  params.set('p', String(p))
  params.set('page_size', String(pageSize))
  const res = await api.get(`/api/group_buy/orders?${params.toString()}`)
  return res.data
}

/** Single order with its participants. */
export async function getOrder(
  id: number
): Promise<ApiResponse<OrderDetailData>> {
  const res = await api.get(`/api/group_buy/orders/${id}`)
  return res.data
}

/** Void an in-progress order and trigger refunds. */
export async function cancelOrder(id: number): Promise<ApiResponse> {
  const res = await api.post(`/api/group_buy/orders/${id}/cancel`)
  return res.data
}

/** Participants awaiting manual refund. */
export async function listRefunds(
  p: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<AdminGroupBuyParticipant>>> {
  const res = await api.get(
    `/api/group_buy/refunds?p=${p}&page_size=${pageSize}`
  )
  return res.data
}

/** Mark a participant record as manually refunded. */
export async function markRefunded(id: number): Promise<ApiResponse> {
  const res = await api.post(`/api/group_buy/refunds/${id}/done`)
  return res.data
}
