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
export type ActivityLotteryStatus =
  | 'draft'
  | 'open'
  | 'drawn'
  | 'expired'
  | 'canceled'

export interface ActivityLotteryPrize {
  id: number
  campaign_id: number
  position: number
  name: string
  count: number
  amount_cents: number
  quota: number
}

export interface ActivityLotteryCampaign {
  id: number
  title: string
  description: string
  status: ActivityLotteryStatus
  published_at: number
  qualification_start_at: number
  qualification_end_at: number
  draw_at: number
  min_participants: number
  /** When greater than zero, one top-tier prize slot is reserved for this account. */
  designated_user_id: number
  participant_count: number
  usd_exchange_rate: number
  quota_per_unit: number
  display_currency?: 'USD' | 'CNY' | 'TOKENS' | 'CUSTOM'
  display_currency_symbol?: string
  display_currency_rate?: number
  drawn_at: number
  created_at: number
  updated_at: number
  prizes: ActivityLotteryPrize[]
}

export interface ActivityLotteryWinner {
  id: number
  masked_name: string
  name: string
  amount_cents: number
}

export interface ActivityLotteryMyPrize {
  name: string
  amount_cents: number
  quota: number
  granted_at: number
  granted: boolean
}

export interface ActivityLotteryView {
  campaign: ActivityLotteryCampaign
  participant_count: number
  joined: boolean
  winners: ActivityLotteryWinner[]
  my_prize?: ActivityLotteryMyPrize
  server_time: number
}

export interface ActivityLotteryPage<T> {
  page: number
  page_size: number
  total: number
  items: T[]
}

export interface ActivityLotteryPrizeInput {
  name: string
  count: number
  /** Smallest unit of the campaign's captured display currency; raw quota in TOKENS mode. */
  amount_cents: number
}

export interface ActivityLotteryDraftInput {
  title: string
  description: string
  qualification_start_at: number
  draw_at: number
  min_participants: number
  designated_user_id: number
  prizes: ActivityLotteryPrizeInput[]
}
