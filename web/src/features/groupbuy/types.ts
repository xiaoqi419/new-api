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
// ============================================================================
// Group Buy Type Definitions
// ============================================================================

export interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

/** A single reward tier: once `count` paid members are reached, every member
 *  receives `per_share_amount` (in USD units). */
export interface GroupBuyTier {
  count: number
  per_share_amount: number
}

/** Admin-configured launchable package. */
export interface GroupBuyPackage {
  id: number
  name: string
  description?: string
  per_share_price?: number
  required_count?: number
  total_price?: number
  total_amount?: number
  tiers?: GroupBuyTier[]
  duration_unit?: string
  duration_value?: number
  enabled?: boolean
  reward_subscription_plan_id?: number
  create_time?: number
}

export type GroupBuyStatus = 'pending' | 'success' | 'failed' | 'expired'

/** A group as listed in the hall. */
export interface GroupBuyHallItem {
  group_no: string
  package_id?: number
  package_name?: string
  per_share_price: number
  per_share_amount: number
  required_count: number
  target_count?: number
  paid_count?: number
  expire_time: number
  tiers?: GroupBuyTier[]
  status: GroupBuyStatus | string
  initiator?: string
  reward_subscription_plan_id?: number
}

export interface GroupBuyParticipant {
  username: string
  pay_status: string
  is_initiator?: boolean
  paid_time?: number
}

/** Full detail for a single group. */
export interface GroupBuyDetail extends GroupBuyHallItem {
  joined?: boolean
  current_amount?: number
  participants?: GroupBuyParticipant[]
  models_hint?: string
  notes?: string[]
}

export interface HallPageInfo {
  items: GroupBuyHallItem[]
  total: number
}

export interface HallData {
  enabled: boolean
  page_info?: HallPageInfo
}

export interface GroupBuyInfo {
  enabled: boolean
  packages: GroupBuyPackage[]
}

/** A payment channel exposed by `/api/user/topup/info`. */
export interface GroupBuyPayMethod {
  name: string
  type: string
  color?: string
  min_topup?: string
}

export interface PayInfo {
  enable_wechatpay_topup?: boolean
  enable_alipay_topup?: boolean
  enable_online_topup?: boolean
  pay_methods?: GroupBuyPayMethod[]
}

export interface CreateGroupBuyRequest {
  package_id: number
  payment_method: string
  scene: string
}

export interface JoinGroupBuyRequest {
  group_no: string
  payment_method: string
  scene: string
}

/** Payment payload returned by create/join. */
export interface PaymentResultData {
  qr_code?: string
  trade_no?: string
  pay_url?: string
  h5_url?: string
  epay_url?: string
  epay_params?: Record<string, string>
  group_no?: string
  checkout_type?: 'qrcode' | 'payurl' | 'urlscheme'
  checkout_value?: string
  gateway_trade_no?: string
  payment_method?: string
  money?: string | number
}

// ============================================================================
// Admin Types
// ============================================================================

/** Generic paginated payload returned by admin list endpoints. */
export interface PageInfo<T> {
  page?: number
  page_size?: number
  total: number
  items: T[]
}

/** Admin order row (backend GroupBuy instance). */
export interface GroupBuyOrder {
  id: number
  group_no: string
  package_id?: number
  package_name?: string
  initiator_id?: number
  status: GroupBuyStatus | string
  required_count: number
  target_count?: number
  paid_count?: number
  total_amount?: number
  total_price?: number
  per_share_amount?: number
  per_share_price?: number
  tiers?: GroupBuyTier[]
  reward_subscription_plan_id?: number
  expire_time?: number
  create_time?: number
  complete_time?: number
}

/** Admin participant / refund record (backend GroupBuyParticipant). */
export interface AdminGroupBuyParticipant {
  id: number
  group_buy_id?: number
  user_id?: number
  username?: string
  trade_no?: string
  pay_status?: string
  pay_money?: number
  join_time?: number
  pay_time?: number
}

export interface OrderDetailData {
  group_buy: GroupBuyOrder
  participants: AdminGroupBuyParticipant[]
}

/** Minimal subscription plan option for binding a group-buy reward. */
export interface SubscriptionPlanOption {
  id: number
  title: string
  upgrade_group?: string
  scope_group?: string
  total_amount?: number
}

/** Create/update payload for a group-buy package. */
export interface PackageFormData {
  id?: number
  name: string
  description: string
  per_share_price: number
  tiers: GroupBuyTier[]
  duration_unit: string
  duration_value: number
  enabled: boolean
  reward_subscription_plan_id: number
}
