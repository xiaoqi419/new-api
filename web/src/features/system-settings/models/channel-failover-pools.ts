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
import { safeJsonParse } from '../utils/json-parser'

export const CHANNEL_FAILOVER_POOLS_OPTION_KEY =
  'channel_failover_setting.pools'

export type ChannelFailoverPool = {
  id: string
  name: string
  enabled: boolean
  group: string
  channel_type: number
  channel_ids: number[]
}

export type SchedulingPoolChannel = {
  id: number
  name: string
  group: string
  type: number
  status: number
}

export type PoolChannelIssue = {
  channelId: number
  reason: 'missing' | 'disabled' | 'mismatched'
}

export type ChannelFailoverPoolValidation = Partial<
  Record<
    'id' | 'name' | 'group' | 'channel_type' | 'channel_ids' | 'conflict',
    string
  >
>

function normalizeChannelIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []

  const ids: number[] = []
  const seen = new Set<number>()
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isSafeInteger(item) || item <= 0) {
      continue
    }
    if (seen.has(item)) continue
    seen.add(item)
    ids.push(item)
  }
  return ids
}

function normalizePool(value: unknown): ChannelFailoverPool | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const group = typeof record.group === 'string' ? record.group.trim() : ''
  const channelType = record.channel_type
  if (
    !id ||
    !name ||
    !group ||
    typeof record.enabled !== 'boolean' ||
    typeof channelType !== 'number' ||
    !Number.isSafeInteger(channelType)
  ) {
    return null
  }

  return {
    id,
    name,
    enabled: record.enabled,
    group,
    channel_type: channelType,
    channel_ids: normalizeChannelIds(record.channel_ids),
  }
}

function hasChannelGroup(
  channel: SchedulingPoolChannel,
  group: string
): boolean {
  return channel.group
    .split(',')
    .map((value) => value.trim())
    .includes(group)
}

export function parseChannelFailoverPools(
  value: string
): ChannelFailoverPool[] {
  const parsed = safeJsonParse<unknown>(value, { fallback: [], silent: true })
  if (!Array.isArray(parsed)) return []

  const pools: ChannelFailoverPool[] = []
  const ids = new Set<string>()
  for (const value of parsed) {
    const pool = normalizePool(value)
    if (!pool || ids.has(pool.id)) continue
    ids.add(pool.id)
    pools.push(pool)
  }
  return pools
}

export function getSchedulingPoolChannelOptions(
  channels: SchedulingPoolChannel[],
  group: string,
  channelType: number
): SchedulingPoolChannel[] {
  return channels.filter(
    (channel) => channel.type === channelType && hasChannelGroup(channel, group)
  )
}

export function getPoolChannelIssues(
  channelIds: number[],
  pool: Pick<ChannelFailoverPool, 'group' | 'channel_type'>,
  channels: SchedulingPoolChannel[]
): PoolChannelIssue[] {
  const channelById = new Map(channels.map((channel) => [channel.id, channel]))
  const issues: PoolChannelIssue[] = []

  for (const channelId of channelIds) {
    const channel = channelById.get(channelId)
    if (!channel) {
      issues.push({ channelId, reason: 'missing' })
      continue
    }
    if (
      channel.type !== pool.channel_type ||
      !hasChannelGroup(channel, pool.group)
    ) {
      issues.push({ channelId, reason: 'mismatched' })
      continue
    }
    if (channel.status !== 1) {
      issues.push({ channelId, reason: 'disabled' })
    }
  }
  return issues
}

export function validateChannelFailoverPool(
  pool: ChannelFailoverPool,
  existingPools: ChannelFailoverPool[],
  channels: SchedulingPoolChannel[]
): ChannelFailoverPoolValidation {
  const errors: ChannelFailoverPoolValidation = {}
  if (!pool.id.trim()) errors.id = 'A stable pool ID is required'
  if (!pool.name.trim()) errors.name = 'A pool name is required'
  if (!pool.group.trim()) errors.group = 'Select an exact channel group'
  if (!Number.isSafeInteger(pool.channel_type)) {
    errors.channel_type = 'Select an exact channel type'
  }

  const uniqueChannelIds = new Set(pool.channel_ids)
  if (
    pool.channel_ids.length < 2 ||
    uniqueChannelIds.size < 2 ||
    uniqueChannelIds.size !== pool.channel_ids.length
  ) {
    errors.channel_ids = 'Choose at least two different channels'
  }

  const issues = getPoolChannelIssues(pool.channel_ids, pool, channels)
  if (
    !errors.channel_ids &&
    issues.some(
      (issue) => issue.reason === 'missing' || issue.reason === 'mismatched'
    )
  ) {
    errors.channel_ids =
      'Each selected channel must match this group and channel type'
  }
  if (
    pool.enabled &&
    existingPools.some(
      (existing) =>
        existing.id !== pool.id &&
        existing.enabled &&
        existing.group === pool.group &&
        existing.channel_type === pool.channel_type
    )
  ) {
    errors.conflict =
      'Only one enabled pool can use this group and channel type'
  }
  return errors
}
