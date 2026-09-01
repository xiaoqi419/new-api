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

import type { PaymentGatewayModeStatus } from '../../types'
import {
  createPaymentGatewayModeApplyMutationVariables,
  getPaymentGatewayModes,
  getPaymentGatewayModeStatusForUi,
  isPaymentGatewayModeApplyAvailable,
  isPaymentGatewayModeApplySucceeded,
  refreshPaymentGatewayModeStatusAfterSave,
} from '../payment-gateway-mode'
import { getPaymentMethodTemplates } from '../payment-method-templates'
import { PaymentGatewayModeControl } from '../payment-settings-section'

type RecoveryStatusPatch = {
  started_at?: number
  effective_mode?: string
  desired_mode?: string
  healthy?: boolean
  capability?: {
    instance_check_known?: boolean
    single_instance_eligible?: boolean
    active_instance_count?: number
  }
  operation?: {
    state?: 'idle' | 'applying' | 'failed'
  }
}

describe('payment gateway mode administration', () => {
  const healthyStatus = {
    target_mode: 'gmpay_native' as const,
    desired_mode: 'gmpay_native' as const,
    effective_mode: 'gmpay_native' as const,
    started_at: 200,
    healthy: true,
    capability: {
      self_restart_enabled: true,
      graceful_shutdown_supported: true,
      shutdown_trigger_ready: true,
      single_instance_eligible: true,
      active_instance_count: 1,
      instance_check_known: true,
      can_self_restart: true,
    },
    operation: { state: 'idle' as const },
  }

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

  test('shows only the safe save and manual-restart path when self-apply is unavailable', () => {
    render(
      <PaymentGatewayModeControl
        effectiveMode='epay_legacy'
        storedTargetMode='epay_legacy'
        draftTargetMode='gmpay_native'
        isSaving={false}
        modeStatus={{
          ...healthyStatus,
          desired_mode: 'epay_legacy',
          effective_mode: 'epay_legacy',
          capability: {
            ...healthyStatus.capability,
            can_self_restart: false,
            unavailable_reason: 'instance_count_not_one',
            single_instance_eligible: false,
            active_instance_count: 2,
          },
        }}
        onDraftTargetModeChange={() => undefined}
        onSave={() => undefined}
        onApply={() => undefined}
      />
    )

    expect(screen.getByText('Manual restart required')).toBeVisible()
    expect(
      screen.getByText(
        'Self-apply requires exactly one active instance for this site.'
      )
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Save target mode' })
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Save and apply' })
    ).not.toBeInTheDocument()
  })

  test('enables save and apply only for an available capability and a changed effective target', () => {
    render(
      <PaymentGatewayModeControl
        effectiveMode='epay_legacy'
        storedTargetMode='epay_legacy'
        draftTargetMode='gmpay_native'
        isSaving={false}
        modeStatus={{
          ...healthyStatus,
          desired_mode: 'epay_legacy',
          effective_mode: 'epay_legacy',
        }}
        onDraftTargetModeChange={() => undefined}
        onSave={() => undefined}
        onApply={() => undefined}
      />
    )

    expect(screen.getByText('Save and apply is available')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Save target mode' })
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save and apply' })).toBeEnabled()
  })

  test('uses capability evaluated for the unsaved draft target in the initial state', () => {
    const status = healthyPaymentGatewayModeStatus()
    status.target_mode = 'gmpay_native'
    status.desired_mode = 'epay_legacy'
    status.effective_mode = 'epay_legacy'

    render(
      <PaymentGatewayModeControl
        effectiveMode='epay_legacy'
        storedTargetMode='epay_legacy'
        draftTargetMode='gmpay_native'
        isSaving={false}
        modeStatus={status}
        onDraftTargetModeChange={() => undefined}
        onSave={() => undefined}
        onApply={() => undefined}
      />
    )

    expect(screen.getByRole('button', { name: 'Save and apply' })).toBeEnabled()
  })

  test('requires explicit confirmation before invoking the apply callback', () => {
    const onApply = vi.fn()

    render(
      <PaymentGatewayModeControl
        effectiveMode='epay_legacy'
        storedTargetMode='epay_legacy'
        draftTargetMode='gmpay_native'
        isSaving={false}
        modeStatus={{
          ...healthyStatus,
          desired_mode: 'epay_legacy',
          effective_mode: 'epay_legacy',
        }}
        onDraftTargetModeChange={() => undefined}
        onSave={() => undefined}
        onApply={onApply}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save and apply' }))
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByText('Confirm save and apply')).toBeVisible()
    expect(
      screen.getByText(
        'This will save the selected mode and gracefully restart this application. The current site may be briefly unavailable, long requests may wait for the graceful shutdown timeout, and a failed restart requires manual operator action.'
      )
    ).toBeVisible()

    const confirmButtons = screen.getAllByRole('button', {
      name: 'Save and apply',
    })
    const confirmButton = confirmButtons.at(-1)
    expect(confirmButton).toBeDefined()
    if (confirmButton) fireEvent.click(confirmButton)
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  test('disables apply while the mutation is pending', () => {
    render(
      <PaymentGatewayModeControl
        effectiveMode='epay_legacy'
        storedTargetMode='epay_legacy'
        draftTargetMode='gmpay_native'
        isSaving={false}
        modeStatus={{
          ...healthyStatus,
          desired_mode: 'epay_legacy',
          effective_mode: 'epay_legacy',
        }}
        applyState='applying'
        isApplying
        onDraftTargetModeChange={() => undefined}
        onSave={() => undefined}
        onApply={() => undefined}
      />
    )

    expect(screen.getByRole('button', { name: 'Applying…' })).toBeDisabled()
  })

  test('does not render an apply action until status capability is available', () => {
    render(
      <PaymentGatewayModeControl
        effectiveMode='epay_legacy'
        storedTargetMode='epay_legacy'
        draftTargetMode='gmpay_native'
        isSaving={false}
        onDraftTargetModeChange={() => undefined}
        onSave={() => undefined}
      />
    )

    expect(
      screen.queryByRole('button', { name: 'Save and apply' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save target mode' })
    ).toBeEnabled()
  })

  test('shows manual restart guidance and hides stale capability when status is unavailable', () => {
    render(
      <PaymentGatewayModeControl
        effectiveMode='epay_legacy'
        storedTargetMode='epay_legacy'
        draftTargetMode='gmpay_native'
        isSaving={false}
        modeStatusUnavailable
        onDraftTargetModeChange={() => undefined}
        onSave={() => undefined}
        onApply={() => undefined}
      />
    )

    expect(screen.getByText('Manual restart required')).toBeVisible()
    expect(
      screen.getByText(
        'Payment gateway mode status is unavailable; save the target and restart this application manually.'
      )
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Save and apply' })
    ).not.toBeInTheDocument()
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

  test('awaits payment mode status refresh after a successful save', async () => {
    let resolveRefresh: (() => void) | undefined
    const refresh = new Promise<void>((resolve) => {
      resolveRefresh = resolve
    })
    const invalidateQueries = vi.fn(() => refresh)
    const queryClient = {
      invalidateQueries,
    } as unknown as Parameters<
      typeof refreshPaymentGatewayModeStatusAfterSave
    >[0]
    let settled = false

    const refreshPromise = refreshPaymentGatewayModeStatusAfterSave(queryClient)
    void refreshPromise.then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(settled).toBe(false)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['payment-gateway-mode-status'],
      refetchType: 'active',
    })

    resolveRefresh?.()
    await refreshPromise
    expect(settled).toBe(true)
  })
})

describe('payment gateway mode apply recovery predicate', () => {
  test('requires a newer healthy single-instance process with both modes loaded and idle', () => {
    expect(
      isPaymentGatewayModeApplySucceeded(
        healthyPaymentGatewayModeStatus(),
        'gmpay_native',
        100
      )
    ).toBe(true)
  })

  test.each([
    ['same process start time', { started_at: 100 }],
    ['wrong effective mode', { effective_mode: 'epay_legacy' }],
    ['wrong desired mode', { desired_mode: 'epay_legacy' }],
    ['unhealthy response', { healthy: false }],
    ['unknown instance check', { capability: { instance_check_known: false } }],
    [
      'multiple instances',
      {
        capability: {
          single_instance_eligible: false,
          active_instance_count: 2,
        },
      },
    ],
    ['operation still applying', { operation: { state: 'applying' } }],
    ['operation failed', { operation: { state: 'failed' } }],
  ])('rejects success for %s', (_name, patch) => {
    const status = healthyPaymentGatewayModeStatus()
    const typedPatch = patch as RecoveryStatusPatch
    const { capability, operation, ...basePatch } = typedPatch
    Object.assign(status, basePatch)
    if (capability) {
      Object.assign(status.capability, capability)
    }
    if (operation) {
      Object.assign(status.operation, operation)
    }

    expect(
      isPaymentGatewayModeApplySucceeded(status, 'gmpay_native', 100)
    ).toBe(false)
  })
})

describe('payment gateway mode apply capability predicate', () => {
  test('allows apply only for a coherent healthy single-instance idle status', () => {
    const status = healthyPaymentGatewayModeStatus()
    status.effective_mode = 'epay_legacy'
    expect(isPaymentGatewayModeApplyAvailable(status, 'gmpay_native')).toBe(
      true
    )
  })

  test('allows a new apply after a previous operation has failed', () => {
    const status = healthyPaymentGatewayModeStatus()
    status.effective_mode = 'epay_legacy'
    status.operation.state = 'failed'
    expect(isPaymentGatewayModeApplyAvailable(status, 'gmpay_native')).toBe(
      true
    )
  })

  test.each([
    ['unhealthy status', { healthy: false }],
    ['self restart disabled', { capability: { self_restart_enabled: false } }],
    [
      'unsupported graceful shutdown',
      {
        capability: {
          graceful_shutdown_supported: false,
          shutdown_trigger_ready: false,
        },
      },
    ],
    ['unknown instance check', { capability: { instance_check_known: false } }],
    [
      'multiple active instances',
      {
        capability: {
          single_instance_eligible: false,
          active_instance_count: 2,
        },
      },
    ],
    ['operation still applying', { operation: { state: 'applying' } }],
  ])('fails closed for %s', (_name, patch) => {
    const status = healthyPaymentGatewayModeStatus()
    status.effective_mode = 'epay_legacy'
    const typedPatch = patch as RecoveryStatusPatch
    const { capability, operation, ...basePatch } = typedPatch
    Object.assign(status, basePatch)
    if (capability) Object.assign(status.capability, capability)
    if (operation) Object.assign(status.operation, operation)

    expect(isPaymentGatewayModeApplyAvailable(status, 'gmpay_native')).toBe(
      false
    )
  })
})

describe('payment gateway mode status query safety', () => {
  test('does not expose cached capability after a failed status query', () => {
    const healthyResponse = {
      success: true,
      message: '',
      data: healthyPaymentGatewayModeStatus(),
    }

    expect(
      getPaymentGatewayModeStatusForUi({
        data: healthyResponse,
        isError: true,
      })
    ).toBeUndefined()
    expect(
      getPaymentGatewayModeStatusForUi({
        data: { ...healthyResponse, success: false },
        isError: false,
      })
    ).toBeUndefined()
    expect(
      getPaymentGatewayModeStatusForUi({
        data: healthyResponse,
        isError: false,
      })
    ).toEqual(healthyResponse.data)
  })

  test('fails closed for malformed or in-flight status responses', () => {
    const healthyResponse = {
      success: true,
      message: '',
      data: healthyPaymentGatewayModeStatus(),
    }

    expect(
      getPaymentGatewayModeStatusForUi({
        data: healthyResponse,
        isError: false,
        isFetching: true,
      })
    ).toBeUndefined()
    expect(
      getPaymentGatewayModeStatusForUi({
        data: {
          ...healthyResponse,
          data: {
            ...healthyResponse.data,
            started_at: '200',
          },
        },
        isError: false,
      })
    ).toBeUndefined()
    expect(
      getPaymentGatewayModeStatusForUi({
        data: {
          ...healthyResponse,
          data: {
            ...healthyResponse.data,
            capability: {
              ...healthyResponse.data.capability,
              active_instance_count: 1.5,
            },
          },
        },
        isError: false,
      })
    ).toBeUndefined()
  })

  test('fails closed when the response was evaluated for another target', () => {
    const healthyResponse = {
      success: true,
      message: '',
      data: healthyPaymentGatewayModeStatus(),
    }

    expect(
      getPaymentGatewayModeStatusForUi({
        data: healthyResponse,
        isError: false,
        targetMode: 'epay_legacy',
      })
    ).toBeUndefined()
  })

  test('captures started_at when apply is clicked rather than when the mutation resolves', () => {
    const status = healthyPaymentGatewayModeStatus()
    const variables = createPaymentGatewayModeApplyMutationVariables(
      'gmpay_native',
      status,
      'started-at-snapshot'
    )

    status.started_at = 300
    expect(variables.previousStartedAt).toBe(200)
    expect(variables.request).toMatchObject({
      request_id: 'started-at-snapshot',
      expected_effective_mode: 'gmpay_native',
      expected_desired_mode: 'gmpay_native',
    })
  })
})

function healthyPaymentGatewayModeStatus(): PaymentGatewayModeStatus {
  return {
    target_mode: 'gmpay_native' as const,
    desired_mode: 'gmpay_native' as const,
    effective_mode: 'gmpay_native' as const,
    started_at: 200,
    healthy: true,
    capability: {
      self_restart_enabled: true,
      graceful_shutdown_supported: true,
      shutdown_trigger_ready: true,
      single_instance_eligible: true,
      active_instance_count: 1,
      instance_check_known: true,
      can_self_restart: true,
    },
    operation: { state: 'idle' as const },
  }
}

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
