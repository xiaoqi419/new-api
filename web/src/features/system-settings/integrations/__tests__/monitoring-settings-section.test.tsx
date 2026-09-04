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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { MonitoringSettingsSection } from '../monitoring-settings-section'

const mocks = vi.hoisted(() => ({
  updateQuotaReminderConfig: vi.fn(),
  sendQuotaReminderTestEmail: vi.fn(),
  updateOption: vi.fn(),
}))

vi.mock('../../api', () => ({
  sendQuotaReminderTestEmail: mocks.sendQuotaReminderTestEmail,
  updateQuotaReminderConfig: mocks.updateQuotaReminderConfig,
}))

vi.mock('../../hooks/use-update-option', () => ({
  useUpdateOption: () => ({
    isPending: false,
    mutateAsync: mocks.updateOption,
  }),
}))

const defaults = {
  QuotaRemindEnabled: true,
  QuotaRemindThreshold: '1',
  QuotaRemindThresholdUnit: 'USD',
  QuotaRemindThresholdQuotaPerUnit: '500000',
  QuotaRemindThresholdUSDRate: '1',
  QuotaRemindThresholdCustomRate: '1',
  QuotaRemindTemplate: 'default',
  QuotaRemindCustomTemplate: '',
  'perf_metrics_setting.enabled': true,
  'perf_metrics_setting.flush_interval': 60,
  'perf_metrics_setting.bucket_time': 'minute' as const,
  'perf_metrics_setting.retention_days': 7,
  'error_alert_setting.enabled': false,
  'error_alert_setting.wecom_webhook_url': '',
  'error_alert_setting.interval_seconds': 300,
  'error_alert_setting.min_count': 3,
  'error_alert_setting.top_n': 5,
  'error_alert_setting.model_filter': '',
  'error_alert_setting.channel_filter': '',
}

function renderSection(overrides: Partial<typeof defaults> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MonitoringSettingsSection
        defaultValues={{ ...defaults, ...overrides }}
      />
    </QueryClientProvider>
  )
  const form = rendered.container.querySelector('form')
  if (!form) throw new Error('monitoring settings form was not rendered')
  return { ...rendered, form }
}

describe('monitoring settings quota reminder behavior', () => {
  beforeEach(() => {
    mocks.updateQuotaReminderConfig.mockReset()
    mocks.sendQuotaReminderTestEmail.mockReset()
    mocks.updateOption.mockReset()
    mocks.updateOption.mockResolvedValue({ success: true, message: '' })
    mocks.updateQuotaReminderConfig.mockResolvedValue({
      success: true,
      message: '',
    })
  })

  test('submits reminder changes through one atomic request without generic reminder keys', async () => {
    const { form } = renderSection()

    const threshold = screen.getByLabelText('Global reminder threshold (USD)')
    fireEvent.change(threshold, { target: { value: '2' } })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mocks.updateQuotaReminderConfig).toHaveBeenCalledTimes(1)
      expect(mocks.updateQuotaReminderConfig.mock.calls[0][0]).toEqual({
        enabled: true,
        threshold: 2,
        template: 'default',
        custom_template: '',
      })
    })
    expect(mocks.updateOption).not.toHaveBeenCalled()
  })

  test('keeps reminder values dirty after an atomic save failure so retry submits them again', async () => {
    mocks.updateQuotaReminderConfig
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce({ success: true, message: '' })
    const { form } = renderSection()

    fireEvent.change(screen.getByLabelText('Global reminder threshold (USD)'), {
      target: { value: '2' },
    })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(mocks.updateQuotaReminderConfig).toHaveBeenCalledTimes(1)
    })

    fireEvent.submit(form)
    await waitFor(() => {
      expect(mocks.updateQuotaReminderConfig).toHaveBeenCalledTimes(2)
    })
  })

  test('keeps unrelated monitoring values dirty after a logical generic save failure', async () => {
    mocks.updateOption.mockResolvedValue({
      success: false,
      message: 'generic save failed',
    })
    const { form } = renderSection()

    fireEvent.change(screen.getByLabelText('Flush interval (minutes)'), {
      target: { value: '61' },
    })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(mocks.updateOption).toHaveBeenCalledTimes(1)
    })

    fireEvent.submit(form)
    await waitFor(() => {
      expect(mocks.updateOption).toHaveBeenCalledTimes(2)
    })
    expect(mocks.updateQuotaReminderConfig).not.toHaveBeenCalled()
  })

  test('blocks an empty custom template before sending it to the server', async () => {
    const { form } = renderSection({
      QuotaRemindTemplate: 'custom',
      QuotaRemindCustomTemplate: '',
    })

    fireEvent.submit(form)

    await waitFor(() => {
      expect(
        screen.getAllByText('This field is required for a custom template')
      ).toHaveLength(3)
    })
    expect(mocks.updateQuotaReminderConfig).not.toHaveBeenCalled()
  })

  test('renders custom preview content literally instead of treating it as a translation key', () => {
    renderSection({
      QuotaRemindTemplate: 'custom',
      QuotaRemindCustomTemplate: JSON.stringify({
        subject: 'Custom subject {{unknown_variable}}',
        html: '<p>ignored</p>',
        text: 'Balance: {{remaining_quota}} / {{unknown_variable}}',
      }),
    })

    expect(
      screen.getByText('Custom subject {{unknown_variable}}')
    ).toBeVisible()
    expect(
      screen.getByText('Balance: $0.72 / {{unknown_variable}}')
    ).toBeVisible()
  })
})
