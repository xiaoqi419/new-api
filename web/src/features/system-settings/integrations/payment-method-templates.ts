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
import type { PaymentGatewayMode } from '../types'
import type { PaymentMethodData } from './payment-method-dialog'

const PAYMENT_TYPE_ICON_NAMES: Record<string, string> = {
  alipay: 'SiAlipay',
  stripe: 'SiStripe',
  'usdt.tron': 'SiTether',
  waffo_pancake: 'LuCreditCard',
  wxpay: 'SiWechat',
}

export function getDefaultPaymentMethodIconName(type: string) {
  return PAYMENT_TYPE_ICON_NAMES[type] ?? ''
}

type PaymentMethodTemplate = {
  name: string
  template: PaymentMethodData
}

export function getPaymentMethodTemplates(
  paymentGatewayMode: PaymentGatewayMode,
  t: (key: string) => string
): PaymentMethodTemplate[] {
  const independentTemplates: PaymentMethodTemplate[] = [
    {
      name: t('Stripe'),
      template: {
        icon: getDefaultPaymentMethodIconName('stripe'),
        min_topup: '10',
        name: 'Stripe',
        type: 'stripe',
      },
    },
    {
      name: 'Waffo Pancake',
      template: {
        icon: getDefaultPaymentMethodIconName('waffo_pancake'),
        name: 'Waffo Pancake',
        type: 'waffo_pancake',
      },
    },
  ]

  if (paymentGatewayMode === 'gmpay_native') {
    return [
      {
        name: t('GMPay USDT (TRON)'),
        template: {
          icon: getDefaultPaymentMethodIconName('usdt.tron'),
          name: 'GMPay USDT (TRON)',
          type: 'usdt.tron',
        },
      },
      ...independentTemplates,
    ]
  }

  return [
    {
      name: t('Epay Alipay'),
      template: {
        icon: getDefaultPaymentMethodIconName('alipay'),
        name: t('Alipay'),
        type: 'alipay',
      },
    },
    {
      name: t('Epay WeChat Pay'),
      template: {
        icon: getDefaultPaymentMethodIconName('wxpay'),
        name: t('WeChat Pay'),
        type: 'wxpay',
      },
    },
    ...independentTemplates,
    {
      name: t('Custom Epay method'),
      template: {
        icon: 'LuCreditCard',
        min_topup: '50',
        name: t('Custom Epay method'),
        type: 'custom1',
      },
    },
  ]
}
