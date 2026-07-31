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

export interface Agent {
  id: number
  owner_user_id: number
  name: string
  status: number
  wallet_quota: number
  cost_ratio: number
  sell_group_ratios?: string
  remark?: string
  created_time?: number
  updated_time?: number
}

export interface AgentLedger {
  id: number
  agent_id: number
  type: string
  quota_delta: number
  balance_after: number
  ref_trade_no?: string
  user_id?: number
  content?: string
  created_time?: number
}

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export async function getAgents(
  p = 1,
  pageSize = 20
): Promise<ApiResponse<PagedResult<Agent>>> {
  const res = await api.get('/api/agent/', {
    params: { p, page_size: pageSize },
  })
  return res.data
}

export async function createAgent(payload: {
  owner_user_id: number
  name: string
  cost_ratio: number
  status: number
  remark?: string
}): Promise<ApiResponse<Agent>> {
  const res = await api.post('/api/agent/', payload)
  return res.data
}

export async function updateAgent(payload: {
  id: number
  name?: string
  cost_ratio?: number
  status?: number
  remark?: string
}): Promise<ApiResponse<Agent>> {
  const res = await api.put('/api/agent/', payload)
  return res.data
}

export async function adjustAgentWallet(
  id: number,
  payload: { delta: number; type: string; remark?: string }
): Promise<ApiResponse<Agent>> {
  const res = await api.post(`/api/agent/${id}/wallet`, payload)
  return res.data
}

export async function approveAgent(id: number): Promise<ApiResponse> {
  const res = await api.post(`/api/agent/${id}/approve`)
  return res.data
}

export async function disableAgent(id: number): Promise<ApiResponse> {
  const res = await api.post(`/api/agent/${id}/disable`)
  return res.data
}

export async function getAgentLedgers(
  id: number,
  p = 1,
  pageSize = 20
): Promise<ApiResponse<PagedResult<AgentLedger>>> {
  const res = await api.get(`/api/agent/${id}/ledgers`, {
    params: { p, page_size: pageSize },
  })
  return res.data
}
