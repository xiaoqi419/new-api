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
// Group Buy Constants
// ============================================================================

/** Hall page size. */
export const PAGE_SIZE = 12

export const PAY_WECHAT = 'wechatpay'
export const PAY_ALIPAY = 'alipay_direct'

/** Types in the topup `pay_methods` list that group buy handles directly
 *  (wechat/alipay) or cannot settle via epay (stripe/waffo). Any other type is
 *  treated as an epay (易支付) channel, matching backend resolveGroupBuyProvider. */
export const NON_EPAY_PAY_METHODS = new Set<string>([
  PAY_WECHAT,
  PAY_ALIPAY,
  'stripe',
  'waffo',
  'waffo_pancake',
])

/** Admin list page size. */
export const ADMIN_PAGE_SIZE = 10

/** Package formation-window duration units (matches backend). */
export const DURATION_UNITS = ['hour', 'day', 'month', 'year'] as const
export type DurationUnit = (typeof DURATION_UNITS)[number]

/** Group-buy order statuses for admin filtering. */
export const ORDER_STATUSES = ['pending', 'success', 'failed'] as const

/** Default tiers proposed when creating a new package. */
export const DEFAULT_NEW_TIERS = [
  { count: 3, per_share_amount: 100 },
  { count: 5, per_share_amount: 120 },
]
