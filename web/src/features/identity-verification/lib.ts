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
export type StatusVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

/** i18n key + badge variant for an identity verification status code. */
export function identityStatusMeta(status?: number): {
  key: string
  variant: StatusVariant
} {
  switch (status) {
    case 1:
      return { key: 'Approved', variant: 'success' }
    case 2:
      return { key: 'Rejected', variant: 'danger' }
    default:
      return { key: 'Pending', variant: 'warning' }
  }
}
