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

export interface AgentSelf {
  id: number
  name: string
  status: number
  wallet_quota: number
  cost_ratio: number
  sell_group_ratios?: string
  options: Record<string, string>
  quota_per_unit: number
}

export interface AgentDomain {
  id: number
  agent_id: number
  domain: string
  verified: boolean
  verify_token: string
  created_time?: number
}

export interface AgentLedger {
  id: number
  type: string
  quota_delta: number
  balance_after: number
  content?: string
  created_time?: number
}

export interface AgentTerminalUser {
  id: number
  username: string
  display_name?: string
  status: number
  quota: number
  used_quota: number
  created_at?: number
}

export interface AgentPaymentConfigView {
  provider: string
  enabled: boolean
  unit_price: number
  min_topup: number
  has_creds: boolean
}

export interface AgentPaymentConfigsResponse {
  configs: AgentPaymentConfigView[]
  providers: string[]
  cred_keys: Record<string, string[]>
}

export interface UpdateAgentPaymentPayload {
  provider: string
  enabled: boolean
  unit_price: number
  min_topup: number
  creds: Record<string, string>
}

export interface PagedResult<T> {
  items: T[]
  total: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export async function getAgentSelf(): Promise<ApiResponse<AgentSelf>> {
  const res = await api.get('/api/agent-console/self')
  return res.data
}

export async function listAgentDomains(): Promise<
  ApiResponse<{ domains: AgentDomain[]; verify_txt: string }>
> {
  const res = await api.get('/api/agent-console/domains')
  return res.data
}

export async function addAgentDomain(
  domain: string
): Promise<ApiResponse<AgentDomain>> {
  const res = await api.post('/api/agent-console/domains', { domain })
  return res.data
}

export async function verifyAgentDomain(
  id: number
): Promise<ApiResponse<AgentDomain>> {
  const res = await api.post(`/api/agent-console/domains/${id}/verify`)
  return res.data
}

export async function deleteAgentDomain(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/agent-console/domains/${id}`)
  return res.data
}

export async function getAgentOptions(): Promise<
  ApiResponse<Record<string, string>>
> {
  const res = await api.get('/api/agent-console/options')
  return res.data
}

export async function updateAgentOptions(
  options: Record<string, string>
): Promise<ApiResponse<Record<string, string>>> {
  const res = await api.put('/api/agent-console/options', { options })
  return res.data
}

export async function updateAgentRatios(
  ratios: Record<string, number>
): Promise<ApiResponse<{ sell_group_ratios: string }>> {
  const res = await api.put('/api/agent-console/ratios', { ratios })
  return res.data
}

export async function getAgentConsoleLedgers(): Promise<
  ApiResponse<PagedResult<AgentLedger>>
> {
  const res = await api.get('/api/agent-console/ledgers', {
    params: { p: 1, page_size: 50 },
  })
  return res.data
}

export async function getAgentConsoleUsers(): Promise<
  ApiResponse<PagedResult<AgentTerminalUser>>
> {
  const res = await api.get('/api/agent-console/users', {
    params: { p: 1, page_size: 50 },
  })
  return res.data
}

export async function getAgentPaymentConfigs(): Promise<
  ApiResponse<AgentPaymentConfigsResponse>
> {
  const res = await api.get('/api/agent-console/payment')
  return res.data
}

export interface AgentPrepayResponse {
  message?: string
  success?: boolean
  data?: Record<string, unknown>
  url?: string
}

export async function agentConsolePrepay(request: {
  amount: number
  payment_method: string
}): Promise<AgentPrepayResponse> {
  const res = await api.post('/api/agent-console/prepay', request, {
    skipBusinessError: true,
  } as Record<string, unknown>)
  return { ...res.data, url: res.data.url }
}

export async function updateAgentPayment(
  payload: UpdateAgentPaymentPayload
): Promise<ApiResponse<AgentPaymentConfigsResponse>> {
  const res = await api.put('/api/agent-console/payment', payload)
  return res.data
}
