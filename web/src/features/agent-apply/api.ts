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
import { api } from '@/lib/api'

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface AgentApplyStatus {
  applied: boolean
  auto_approve: boolean
  agent?: {
    id: number
    name: string
    status: number
    wallet_quota: number
    cost_ratio: number
  }
}

export async function getAgentApplyStatus(): Promise<
  ApiResponse<AgentApplyStatus>
> {
  const res = await api.get('/api/agent-apply')
  return res.data
}

export async function submitAgentApply(payload: {
  name: string
  prepay_amount: number
}): Promise<ApiResponse> {
  const res = await api.post('/api/agent-apply', payload)
  return res.data
}
