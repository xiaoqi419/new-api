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
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { getPaymentGatewayModes } from '../payment-gateway-mode'
import { getPaymentMethodTemplates } from '../payment-method-templates'
import { PaymentGatewayModeControl } from '../payment-settings-section'

describe('payment gateway mode administration', () => {
  test('shows the frozen current mode separately from a restart-pending saved target', () => {
    render(
      <PaymentGatewayModeControl
        effectiveMode='epay_legacy'
        storedTargetMode='gmpay_native'
        draftTargetMode='gmpay_native'
        isSaving={false}
        onDraftTargetModeChange={() => undefined}
        onSave={() => undefined}
      />
    )

    expect(
      screen.getByTestId('effective-payment-gateway-mode')
    ).toHaveTextContent('Domestic / Legacy EPay')
    expect(screen.getByTestId('target-payment-gateway-mode')).toHaveTextContent(
      'International / GMPay Native'
    )
    expect(
      screen.getByText('Saved successfully; restart to apply')
    ).toBeVisible()
    expect(
      screen.getByText(
        'The saved target will become effective only after the application restarts.'
      )
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Save target mode' })
    ).toBeDisabled()
  })

  test('keeps an unsaved target distinct and saves only after explicit confirmation', () => {
    const onDraftTargetModeChange = vi.fn()
    const onSave = vi.fn()

    render(
      <PaymentGatewayModeControl
        effectiveMode='epay_legacy'
        storedTargetMode='epay_legacy'
        draftTargetMode='gmpay_native'
        isSaving={false}
        onDraftTargetModeChange={onDraftTargetModeChange}
        onSave={onSave}
      />
    )

    expect(screen.getByText('Unsaved target change')).toBeVisible()
    expect(
      screen.queryByText('Saved successfully; restart to apply')
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Domestic / Legacy EPay' })
    )
    expect(onDraftTargetModeChange).toHaveBeenCalledWith('epay_legacy')

    fireEvent.click(screen.getByRole('button', { name: 'Save target mode' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  test('defaults absent modes to legacy and accepts only the two server modes', () => {
    expect(getPaymentGatewayModes(undefined)).toEqual({
      effectiveMode: 'epay_legacy',
      targetMode: 'epay_legacy',
    })
    expect(
      getPaymentGatewayModes([
        { key: 'PaymentGatewayMode', value: 'gmpay_native' },
        { key: 'EffectivePaymentGatewayMode', value: 'gmpay_native' },
      ])
    ).toEqual({
      effectiveMode: 'gmpay_native',
      targetMode: 'gmpay_native',
    })
    expect(
      getPaymentGatewayModes([
        { key: 'PaymentGatewayMode', value: 'unexpected' },
        { key: 'EffectivePaymentGatewayMode', value: 'unexpected' },
      ])
    ).toEqual({
      effectiveMode: 'epay_legacy',
      targetMode: 'epay_legacy',
    })
  })
})

describe('payment method templates by effective mode', () => {
  const t = (key: string) => key

  test('suggests legacy EPay entries only while legacy is effective', () => {
    const types = getPaymentMethodTemplates('epay_legacy', t).map(
      (item) => item.template.type
    )

    expect(types).toEqual([
      'alipay',
      'wxpay',
      'stripe',
      'waffo_pancake',
      'custom1',
    ])
    expect(types).not.toContain('usdt.tron')
  })

  test('suggests the exact GMPay TRON entry without incompatible EPay entries while native is effective', () => {
    const templates = getPaymentMethodTemplates('gmpay_native', t)
    const types = templates.map((item) => item.template.type)

    expect(types).toEqual(['usdt.tron', 'stripe', 'waffo_pancake'])
    expect(templates[0]).toMatchObject({
      name: 'GMPay USDT (TRON)',
      template: {
        name: 'GMPay USDT (TRON)',
        type: 'usdt.tron',
      },
    })
    expect(types).not.toContain('alipay')
    expect(types).not.toContain('wxpay')
    expect(types).not.toContain('custom1')
  })
})
