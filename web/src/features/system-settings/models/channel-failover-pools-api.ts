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
import { getChannels } from '@/features/channels/api'

import type { SchedulingPoolChannel } from './channel-failover-pools'

const CHANNEL_PAGE_SIZE = 100

export async function getSchedulingPoolChannels(): Promise<
  SchedulingPoolChannel[]
> {
  const channels = new Map<number, SchedulingPoolChannel>()
  let page = 1
  let total = Number.POSITIVE_INFINITY

  while (channels.size < total) {
    const response = await getChannels({
      p: page,
      page_size: CHANNEL_PAGE_SIZE,
      id_sort: true,
    })
    if (!response.success) {
      throw new Error(response.message || 'Failed to load channel options')
    }

    const data = response.data
    const items = data?.items ?? []
    total = data?.total ?? channels.size + items.length
    for (const channel of items) {
      channels.set(channel.id, {
        id: channel.id,
        name: channel.name,
        group: channel.group,
        type: channel.type,
        status: channel.status,
      })
    }
    if (items.length === 0) break
    page += 1
  }

  return [...channels.values()]
}
