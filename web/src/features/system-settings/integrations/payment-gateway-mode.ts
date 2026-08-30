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
import type { PaymentGatewayMode, SystemOption } from '../types'

function normalizePaymentGatewayMode(value: string | undefined) {
  return value === 'gmpay_native' || value === 'epay_legacy'
    ? value
    : 'epay_legacy'
}

export function getPaymentGatewayModes(options: SystemOption[] | undefined): {
  effectiveMode: PaymentGatewayMode
  targetMode: PaymentGatewayMode
} {
  const values = new Map(options?.map((option) => [option.key, option.value]))
  return {
    effectiveMode: normalizePaymentGatewayMode(
      values.get('EffectivePaymentGatewayMode')
    ),
    targetMode: normalizePaymentGatewayMode(values.get('PaymentGatewayMode')),
  }
}
