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
import { getCurrencyDisplay } from '@/lib/currency'
import { formatQuota } from '@/lib/format'

import type { GroupBuyHallItem, GroupBuyPackage, GroupBuyTier } from './types'

/**
 * Format a group-buy share amount (stored in USD units) into the configured
 * display currency. Quota is `amount * quotaPerUnit` (quotaPerUnit tokens = 1 USD).
 */
export function formatShare(amount: number): string {
  const { config } = getCurrencyDisplay()
  return formatQuota(amount * config.quotaPerUnit)
}

/** i18n key (English source string) for a package formation-window unit. */
export function durationUnitKey(unit?: string): string {
  switch (unit) {
    case 'hour':
      return 'Hours'
    case 'day':
      return 'Days'
    case 'month':
      return 'Months'
    case 'year':
      return 'Years'
    default:
      return unit ?? ''
  }
}

/** Only allow http/https redirect targets returned by the backend. */
export function isSafeHttpUrl(value?: string): boolean {
  if (!value) return false
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Normalize tiers; falls back to a single tier from required_count. */
export function resolveTiers(item: {
  tiers?: GroupBuyTier[]
  required_count: number
  per_share_amount: number
}): GroupBuyTier[] {
  if (item.tiers && item.tiers.length > 0) {
    return [...item.tiers].sort((a, b) => a.count - b.count)
  }
  return [
    { count: item.required_count, per_share_amount: item.per_share_amount },
  ]
}

export interface TierBounds {
  minCount: number
  maxCount: number
  floorAmount: number
  bestAmount: number
}

export function tierBounds(item: GroupBuyHallItem): TierBounds {
  const tiers = resolveTiers(item)
  const first = tiers[0]
  const last = tiers.at(-1) ?? first
  return {
    minCount: first.count,
    maxCount: last.count,
    floorAmount: first.per_share_amount,
    bestAmount: last.per_share_amount,
  }
}

/** Highest per-share amount already unlocked by the current paid count. */
export function unlockedAmount(item: GroupBuyHallItem): number {
  const tiers = resolveTiers(item)
  const paid = item.paid_count ?? 0
  let amount = tiers[0].per_share_amount
  for (const tier of tiers) {
    if (paid >= tier.count) amount = tier.per_share_amount
  }
  return amount
}

/** Progress ratio (0..1) toward the final tier target. */
export function progressRatio(item: GroupBuyHallItem): number {
  const target = tierBounds(item).maxCount || item.required_count
  if (target <= 0) return 0
  return Math.min(1, (item.paid_count ?? 0) / target)
}

/** Seconds remaining until expiry (0 when expired). */
export function secondsRemaining(expireTime: number): number {
  const diff = expireTime - Math.floor(Date.now() / 1000)
  return diff > 0 ? diff : 0
}

export interface PackageInfo {
  price: number
  minCount: number
  maxCount: number
  floorAmount: number
  bestAmount: number
}

/** Normalize a launchable package (tiered or legacy even-split). */
export function packageInfo(pkg: GroupBuyPackage): PackageInfo {
  const tiers = pkg.tiers ?? []
  if (tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => a.count - b.count)
    const first = sorted[0]
    const last = sorted.at(-1) ?? first
    return {
      price: Number(pkg.per_share_price) || 0,
      minCount: first.count,
      maxCount: last.count,
      floorAmount: first.per_share_amount,
      bestAmount: last.per_share_amount,
    }
  }
  const rc = pkg.required_count || 1
  return {
    price: (Number(pkg.total_price) || 0) / rc,
    minCount: rc,
    maxCount: rc,
    floorAmount: Math.floor((Number(pkg.total_amount) || 0) / rc),
    bestAmount: Math.floor((Number(pkg.total_amount) || 0) / rc),
  }
}
