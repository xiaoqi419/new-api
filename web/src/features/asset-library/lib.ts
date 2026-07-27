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

import { ASSET_STATUS_ACTIVE, ASSET_STATUS_FAILED } from './constants'

export function isTerminalAssetStatus(status: string): boolean {
  return status === ASSET_STATUS_ACTIVE || status === ASSET_STATUS_FAILED
}

export function assetStatusMeta(status: string): {
  key: string
  variant: StatusVariant
} {
  if (status === ASSET_STATUS_ACTIVE) {
    return { key: 'Ready', variant: 'success' }
  }
  if (status === ASSET_STATUS_FAILED) {
    return { key: 'Failed', variant: 'danger' }
  }
  return { key: 'Processing', variant: 'warning' }
}
