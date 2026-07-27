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
// Lottery Type Definitions
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

/** Prize type: quota grant / redraw (free spin) / empty. */
export type PrizeType = 'quota' | 'redraw' | 'empty'

/** A configurable wheel prize. */
export interface LotteryPrize {
  key: string
  name: string
  type: PrizeType
  quota: number
  weight: number
  color: string
  enabled: boolean
}

/** Consume-based card grant rule. */
export interface ConsumeGrantRule {
  threshold: number
  cards_per: number
  enabled: boolean
}

/** Topup-based card grant rule (cards may have an expiry). */
export interface TopupGrantRule {
  threshold: number
  cards_per: number
  card_expire_days: number
  enabled: boolean
}

/** Progress toward the next lottery card (based on cumulative consumption). */
export interface LotteryProgress {
  consumed_quota: number
  next_threshold: number
  has_next: boolean
}

/** User-facing lottery status. */
export interface LotteryStatus {
  enabled: boolean
  base_quota?: number
  prizes?: LotteryPrize[]
  available_cards?: number
  cards?: LotteryCard[]
  progress?: LotteryProgress
}

/** A single draw record. */
export interface LotteryDrawRecord {
  id: number
  user_id?: number
  username?: string
  prize_key?: string
  prize_name?: string
  prize_type?: PrizeType
  prize_quota?: number
  base_quota?: number
  total_quota?: number
  card_id?: number
  created_time?: number
}

/** A lottery card (one draw chance). */
export interface LotteryCard {
  id: number
  user_id?: number
  source?: string
  status?: number
  expire_time?: number
  created_time?: number
}

/** Admin-editable lottery config. */
export interface LotteryConfig {
  enabled: boolean
  base_quota: number
  prizes: LotteryPrize[]
  grant_rules: ConsumeGrantRule[]
  topup_grant_rules: TopupGrantRule[]
}
