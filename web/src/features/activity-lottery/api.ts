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
import { requireServerSuccess } from '@/lib/server-error-message'

import type {
  ActivityLotteryCampaign,
  ActivityLotteryDraftInput,
  ActivityLotteryPage,
  ActivityLotteryView,
} from './types'

type Response<T> = { success: boolean; message: string; data: T }

export const activityLotteryQueryKeys = {
  current: ['activity-lottery', 'current'] as const,
  rounds: (page: number) => ['activity-lottery', 'rounds', page] as const,
  round: (id: number) => ['activity-lottery', 'round', id] as const,
  admin: (page: number) => ['activity-lottery', 'admin', page] as const,
}

export async function getCurrentActivityLottery(): Promise<ActivityLotteryView | null> {
  const response = await api.get<Response<ActivityLotteryView | null>>(
    '/api/activity/lottery/current'
  )
  return requireServerSuccess(response.data).data
}

export async function getActivityLotteryRound(
  id: number
): Promise<ActivityLotteryView> {
  const response = await api.get<Response<ActivityLotteryView>>(
    `/api/activity/lottery/rounds/${id}`
  )
  return requireServerSuccess(response.data).data
}

export async function getActivityLotteryRounds(
  page: number
): Promise<ActivityLotteryPage<ActivityLotteryCampaign>> {
  const response = await api.get<
    Response<ActivityLotteryPage<ActivityLotteryCampaign>>
  >('/api/activity/lottery/rounds', { params: { p: page, page_size: 10 } })
  return requireServerSuccess(response.data).data
}

export async function adminGetActivityLotteryRounds(
  page: number
): Promise<ActivityLotteryPage<ActivityLotteryCampaign>> {
  const response = await api.get<
    Response<ActivityLotteryPage<ActivityLotteryCampaign>>
  >('/api/activity/lottery/admin/rounds', {
    params: { p: page, page_size: 10 },
  })
  return requireServerSuccess(response.data).data
}

export async function adminCreateActivityLotteryRound(
  input: ActivityLotteryDraftInput
): Promise<ActivityLotteryCampaign> {
  const response = await api.post<Response<ActivityLotteryCampaign>>(
    '/api/activity/lottery/admin/rounds',
    input
  )
  return requireServerSuccess(response.data).data
}

export async function adminUpdateActivityLotteryRound(
  id: number,
  input: ActivityLotteryDraftInput
): Promise<ActivityLotteryCampaign> {
  const response = await api.put<Response<ActivityLotteryCampaign>>(
    `/api/activity/lottery/admin/rounds/${id}`,
    input
  )
  return requireServerSuccess(response.data).data
}

export async function adminPublishActivityLotteryRound(
  id: number
): Promise<ActivityLotteryCampaign> {
  const response = await api.post<Response<ActivityLotteryCampaign>>(
    `/api/activity/lottery/admin/rounds/${id}/publish`
  )
  return requireServerSuccess(response.data).data
}

export async function adminCancelActivityLotteryRound(
  id: number
): Promise<ActivityLotteryCampaign> {
  const response = await api.post<Response<ActivityLotteryCampaign>>(
    `/api/activity/lottery/admin/rounds/${id}/cancel`
  )
  return requireServerSuccess(response.data).data
}

export async function adminDrawActivityLotteryRound(
  id: number
): Promise<ActivityLotteryCampaign> {
  const response = await api.post<Response<ActivityLotteryCampaign>>(
    `/api/activity/lottery/admin/rounds/${id}/draw`
  )
  return requireServerSuccess(response.data).data
}

export async function adminExportActivityLotteryWinners(
  id: number
): Promise<void> {
  const response = await api.get<Blob>(
    `/api/activity/lottery/admin/rounds/${id}/winners/export`,
    { responseType: 'blob', skipErrorHandler: true }
  )
  const url = window.URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = `activity-lottery-winners-${id}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
