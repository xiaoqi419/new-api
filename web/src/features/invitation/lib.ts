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
import type { StatusVariant } from '@/components/status-badge'

import {
  REBATE_STATUS_CANCELLED,
  REBATE_STATUS_PAID,
  REBATE_STATUS_PENDING,
} from './constants'

export function buildInviteLink(affCode: string): string {
  if (typeof window === 'undefined' || !affCode) return ''
  return `${window.location.origin}/sign-up?aff=${affCode}`
}

export function formatRebateRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`
}

export function rebateStatusMeta(status: string): {
  key: string
  variant: StatusVariant
} {
  switch (status) {
    case REBATE_STATUS_PAID:
      return { key: 'Paid', variant: 'success' }
    case REBATE_STATUS_CANCELLED:
      return { key: 'Cancelled', variant: 'neutral' }
    case REBATE_STATUS_PENDING:
    default:
      return { key: 'Pending', variant: 'warning' }
  }
}
