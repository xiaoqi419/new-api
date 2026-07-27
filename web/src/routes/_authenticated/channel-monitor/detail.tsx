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
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { ChannelMonitorDetail } from '@/features/channel-monitor/detail'

const detailSearchSchema = z.object({
  channel_id: z.coerce.number().catch(0),
  days: z.coerce.number().catch(7),
})

export const Route = createFileRoute('/_authenticated/channel-monitor/detail')({
  component: RouteComponent,
  validateSearch: detailSearchSchema,
})

function RouteComponent() {
  const { channel_id, days } = Route.useSearch()
  return <ChannelMonitorDetail channelId={channel_id} initialDays={days} />
}
