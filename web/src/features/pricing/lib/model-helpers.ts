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
import { EXCLUDED_GROUPS, FILTER_ALL, QUOTA_TYPE_VALUES } from '../constants'
import type { PricingModel, UsableGroupMap } from '../types'

// ----------------------------------------------------------------------------
// Model Helper Utilities
// ----------------------------------------------------------------------------

/**
 * Get available groups for a model
 */
export function getAvailableGroups(
  model: PricingModel,
  usableGroup: UsableGroupMap
): string[] {
  const modelEnableGroups = Array.isArray(model.enable_groups)
    ? model.enable_groups
    : []

  return Object.keys(usableGroup)
    .filter((g) => !EXCLUDED_GROUPS.includes(g))
    .filter((g) => modelEnableGroups.includes(g))
}

/**
 * Read a configured group ratio while preserving valid zero ratios.
 */
export function getConfiguredGroupRatio(
  groupRatio: Record<string, number>,
  group: string
): number {
  const ratio = groupRatio[group]
  return typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : 1
}

/**
 * Resolve the group ratio used by model square summary prices.
 *
 * When no specific group is selected, the model square shows the best price
 * available to the viewer. When a group filter is active, it shows that
 * group's price instead.
 */
export function getDisplayGroupRatio(
  model: PricingModel,
  selectedGroup?: string
): number {
  const modelEnableGroups = Array.isArray(model.enable_groups)
    ? model.enable_groups
    : []
  const groupRatio = model.group_ratio || {}

  if (
    selectedGroup &&
    selectedGroup !== FILTER_ALL &&
    modelEnableGroups.includes(selectedGroup)
  ) {
    return getConfiguredGroupRatio(groupRatio, selectedGroup)
  }

  if (modelEnableGroups.length === 0) {
    return 1
  }

  let minRatio = Number.POSITIVE_INFINITY

  for (const group of modelEnableGroups) {
    const ratio = groupRatio[group]
    if (
      typeof ratio === 'number' &&
      Number.isFinite(ratio) &&
      ratio < minRatio
    ) {
      minRatio = ratio
    }
  }

  return minRatio === Number.POSITIVE_INFINITY ? 1 : minRatio
}

/** Smallest ratio the badge prints as an exact number. */
const MIN_DISPLAYED_GROUP_RATIO = 0.001

/**
 * Format a group ratio as a display multiplier, e.g. `x0.9`.
 *
 * A ratio that would round away to zero renders as `x<0.001` instead of `x0`,
 * because `x0` claims the group is free. Only a ratio configured as exactly
 * zero may print `x0`.
 */
export function formatGroupRatioLabel(
  ratio: number | undefined
): string | undefined {
  if (ratio == null || !Number.isFinite(ratio)) return undefined
  if (Number.isInteger(ratio)) return `x${ratio}`
  if (ratio > 0 && ratio < MIN_DISPLAYED_GROUP_RATIO) {
    return `x<${MIN_DISPLAYED_GROUP_RATIO}`
  }

  return `x${ratio.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
}

export type GroupRatioTone = 'discount' | 'premium' | 'neutral'

/**
 * Classify a group ratio so the multiplier can be read without parsing the
 * number: below 1 is cheaper than base, above 1 is a surcharge.
 */
export function getGroupRatioTone(ratio: number | undefined): GroupRatioTone {
  if (ratio == null || !Number.isFinite(ratio) || ratio === 1) return 'neutral'
  return ratio < 1 ? 'discount' : 'premium'
}

export const GROUP_RATIO_TONE_CLASS: Record<GroupRatioTone, string> = {
  discount: 'bg-success/12 text-success',
  premium: 'bg-warning/12 text-warning',
  neutral: 'bg-muted text-muted-foreground',
}

/**
 * Replace model placeholder in endpoint path
 */
export function replaceModelInPath(path: string, modelName: string): string {
  return path.replaceAll('{model}', modelName)
}

/**
 * Check if model is token-based pricing
 */
export function isTokenBasedModel(model: PricingModel): boolean {
  return model.quota_type === QUOTA_TYPE_VALUES.TOKEN
}
