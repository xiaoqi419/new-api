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
import { describe, expect, test } from 'vitest'

import {
  getPoolChannelIssues,
  getSchedulingPoolChannelOptions,
  parseChannelFailoverPools,
  validateChannelFailoverPool,
  type ChannelFailoverPool,
  type SchedulingPoolChannel,
} from '../channel-failover-pools'

const channels: SchedulingPoolChannel[] = [
  {
    id: 11,
    name: 'Primary OpenAI',
    group: 'standard,priority',
    type: 1,
    status: 1,
  },
  {
    id: 12,
    name: 'Backup OpenAI',
    group: 'standard',
    type: 1,
    status: 1,
  },
  {
    id: 13,
    name: 'Other type',
    group: 'standard',
    type: 14,
    status: 1,
  },
  {
    id: 14,
    name: 'Disabled OpenAI',
    group: 'standard',
    type: 1,
    status: 0,
  },
]

const validPool: ChannelFailoverPool = {
  id: 'pool-openai-standard',
  name: 'Standard OpenAI pool',
  enabled: true,
  group: 'standard',
  channel_type: 1,
  channel_ids: [11, 12],
}

describe('channel failover pool configuration', () => {
  test('normalizes persisted pools while preserving their stable channel IDs', () => {
    expect(
      parseChannelFailoverPools(
        '[{"id":"pool-a","name":"  Standard pool  ","enabled":true,"group":" standard ","channel_type":1,"channel_ids":[11,11,12]}, {"id":"bad","name":42}]'
      )
    ).toEqual([
      {
        id: 'pool-a',
        name: 'Standard pool',
        enabled: true,
        group: 'standard',
        channel_type: 1,
        channel_ids: [11, 12],
      },
    ])
  })

  test('shows only the exact group and channel type as selectable members', () => {
    expect(getSchedulingPoolChannelOptions(channels, 'standard', 1)).toEqual([
      {
        id: 11,
        name: 'Primary OpenAI',
        group: 'standard,priority',
        type: 1,
        status: 1,
      },
      {
        id: 12,
        name: 'Backup OpenAI',
        group: 'standard',
        type: 1,
        status: 1,
      },
      {
        id: 14,
        name: 'Disabled OpenAI',
        group: 'standard',
        type: 1,
        status: 0,
      },
    ])
  })

  test('flags deleted and disabled configured members so an administrator can remove them', () => {
    expect(getPoolChannelIssues([11, 14, 99], validPool, channels)).toEqual([
      {
        channelId: 14,
        reason: 'disabled',
      },
      {
        channelId: 99,
        reason: 'missing',
      },
    ])
  })

  test('rejects duplicate members and enabled group/type conflicts', () => {
    const duplicateMembers = validateChannelFailoverPool(
      { ...validPool, channel_ids: [11, 11] },
      [],
      channels
    )
    const duplicatePair = validateChannelFailoverPool(
      { ...validPool, id: 'pool-openai-standard-2' },
      [validPool],
      channels
    )

    expect(duplicateMembers.channel_ids).toBe(
      'Choose at least two different channels'
    )
    expect(duplicatePair.conflict).toBe(
      'Only one enabled pool can use this group and channel type'
    )
  })

  test('requires two current matching members before an enabled pool can be saved', () => {
    const errors = validateChannelFailoverPool(
      { ...validPool, channel_ids: [11, 13] },
      [],
      channels
    )

    expect(errors.channel_ids).toBe(
      'Each selected channel must match this group and channel type'
    )
  })

  test('allows an enabled pool to retain disabled members', () => {
    const errors = validateChannelFailoverPool(
      { ...validPool, channel_ids: [11, 14] },
      [],
      channels
    )

    expect(errors.channel_ids).toBeUndefined()
  })
})
