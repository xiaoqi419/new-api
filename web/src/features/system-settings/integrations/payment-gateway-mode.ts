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
import type { QueryClient } from '@tanstack/react-query'

import type {
  PaymentGatewayMode,
  PaymentGatewayModeApplyRequest,
  PaymentGatewayModeStatus,
  PaymentGatewayModeStatusResponse,
  SystemOption,
} from '../types'

export const paymentGatewayModeStatusQueryKey = [
  'payment-gateway-mode-status',
] as const

export function paymentGatewayModeStatusQueryKeyForTarget(
  targetMode: PaymentGatewayMode
) {
  return [...paymentGatewayModeStatusQueryKey, targetMode] as const
}

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

export type PaymentGatewayModeApplyMutationVariables = {
  request: PaymentGatewayModeApplyRequest
  previousStartedAt: number
}

/**
 * Build all apply variables from one status snapshot.  Keeping the timestamp
 * beside the request prevents a later React Query refresh from changing the
 * recovery baseline while the mutation is in flight.
 */
export function createPaymentGatewayModeApplyMutationVariables(
  targetMode: PaymentGatewayMode,
  status: PaymentGatewayModeStatus,
  requestId: string
): PaymentGatewayModeApplyMutationVariables {
  return {
    request: {
      target_mode: targetMode,
      expected_effective_mode: status.effective_mode,
      expected_desired_mode: status.desired_mode,
      request_id: requestId,
    },
    previousStartedAt: status.started_at,
  }
}

/**
 * Apply is executable only when the server has proved every safety condition
 * for this exact target.  Keeping the predicate shared between the control
 * and the mutation callback prevents a contradictory status payload from
 * enabling one path while disabling the other.
 */
export function isPaymentGatewayModeApplyAvailable(
  status: PaymentGatewayModeStatus | undefined,
  targetMode: PaymentGatewayMode
) {
  if (
    !status ||
    !isPaymentGatewayMode(targetMode) ||
    status.target_mode !== targetMode ||
    !Number.isFinite(status.started_at) ||
    !isRecord(status.capability) ||
    !isRecord(status.operation)
  ) {
    return false
  }

  const { capability, operation } = status
  return (
    status.healthy === true &&
    capability.self_restart_enabled === true &&
    capability.graceful_shutdown_supported === true &&
    capability.shutdown_trigger_ready === true &&
    capability.instance_check_known === true &&
    capability.single_instance_eligible === true &&
    capability.active_instance_count === 1 &&
    capability.can_self_restart === true &&
    operation.state !== 'applying' &&
    status.effective_mode !== targetMode
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPaymentGatewayMode(value: unknown): value is PaymentGatewayMode {
  return value === 'epay_legacy' || value === 'gmpay_native'
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isOptionalString(record: Record<string, unknown>, key: string) {
  return !(key in record) || typeof record[key] === 'string'
}

function isPaymentGatewayModeStatus(
  value: unknown
): value is PaymentGatewayModeStatus {
  if (!isRecord(value)) return false
  if (
    !isPaymentGatewayMode(value.target_mode) ||
    !isPaymentGatewayMode(value.desired_mode) ||
    !isPaymentGatewayMode(value.effective_mode) ||
    !isFiniteNonNegativeNumber(value.started_at) ||
    typeof value.healthy !== 'boolean' ||
    !isRecord(value.capability) ||
    !isRecord(value.operation)
  ) {
    return false
  }

  const capability = value.capability
  if (
    typeof capability.self_restart_enabled !== 'boolean' ||
    typeof capability.graceful_shutdown_supported !== 'boolean' ||
    typeof capability.shutdown_trigger_ready !== 'boolean' ||
    typeof capability.single_instance_eligible !== 'boolean' ||
    typeof capability.instance_check_known !== 'boolean' ||
    typeof capability.can_self_restart !== 'boolean' ||
    typeof capability.active_instance_count !== 'number' ||
    !Number.isFinite(capability.active_instance_count) ||
    !Number.isInteger(capability.active_instance_count) ||
    capability.active_instance_count < 0 ||
    !isOptionalString(capability, 'unavailable_reason')
  ) {
    return false
  }

  const operation = value.operation
  if (
    (operation.state !== 'idle' &&
      operation.state !== 'applying' &&
      operation.state !== 'failed') ||
    !isOptionalString(operation, 'request_id') ||
    ('target_mode' in operation &&
      operation.target_mode !== undefined &&
      !isPaymentGatewayMode(operation.target_mode)) ||
    ('accepted_at' in operation &&
      operation.accepted_at !== undefined &&
      !isFiniteNonNegativeNumber(operation.accepted_at)) ||
    !isOptionalString(operation, 'reason')
  ) {
    return false
  }

  return true
}

function isPaymentGatewayModeStatusResponse(
  value: unknown
): value is PaymentGatewayModeStatusResponse {
  return (
    isRecord(value) &&
    typeof value.success === 'boolean' &&
    value.success === true &&
    typeof value.message === 'string' &&
    isPaymentGatewayModeStatus(value.data)
  )
}

/**
 * React Query can retain the last successful value while a refetch is in an
 * error state.  A cached capability must never enable a destructive restart
 * action after the server has stopped proving that the action is safe.
 */
export function getPaymentGatewayModeStatusForUi(input: {
  data: unknown
  isError: boolean
  isFetching?: boolean
  targetMode?: PaymentGatewayMode
}): PaymentGatewayModeStatus | undefined {
  if (
    input.isError ||
    input.isFetching === true ||
    !isPaymentGatewayModeStatusResponse(input.data)
  ) {
    return undefined
  }
  if (
    input.targetMode !== undefined &&
    input.data.data.target_mode !== input.targetMode
  ) {
    return undefined
  }
  return input.data.data
}

/**
 * Wait for the active status query to refetch after saving the desired mode.
 * The apply action uses this result as its optimistic-concurrency snapshot.
 */
export async function refreshPaymentGatewayModeStatusAfterSave(
  queryClient: QueryClient
) {
  await queryClient.invalidateQueries({
    queryKey: paymentGatewayModeStatusQueryKey,
    refetchType: 'active',
  })
}

/**
 * A restart is successful only after the new process is healthy, reports a
 * later start timestamp, has loaded the requested effective mode, and still
 * proves that this site is a single active instance.  Keeping this predicate
 * pure makes the recovery contract easy to test without timers or a browser.
 */
export function isPaymentGatewayModeApplySucceeded(
  status: PaymentGatewayModeStatus,
  targetMode: PaymentGatewayMode,
  previousStartedAt: number
) {
  return (
    Number.isFinite(previousStartedAt) &&
    status.healthy &&
    status.started_at > previousStartedAt &&
    status.effective_mode === targetMode &&
    status.desired_mode === targetMode &&
    status.capability.instance_check_known &&
    status.capability.single_instance_eligible &&
    status.capability.active_instance_count === 1 &&
    status.operation.state === 'idle'
  )
}
