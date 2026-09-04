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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { getCurrencyLabel } from '@/lib/currency'
import { getEditableQuotaStep } from '@/lib/format'
import { convertDisplayedQuotaBetweenSnapshots } from '@/lib/quota-threshold'
import {
  useSystemConfigStore,
  type CurrencyConfig,
} from '@/stores/system-config-store'

import { sendQuotaReminderTestEmail, updateQuotaReminderConfig } from '../api'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'
import type { QuotaReminderTemplateId } from '../types'
import { safeNumberFieldProps } from '../utils/numeric-field'

const quotaReminderTemplateSchema = z.object({
  subject: z.string(),
  html: z.string(),
  text: z.string(),
})

type QuotaReminderTemplate = z.infer<typeof quotaReminderTemplateSchema>

const EMPTY_CUSTOM_TEMPLATE: QuotaReminderTemplate = {
  subject: '',
  html: '',
  text: '',
}

const BUILT_IN_TEMPLATE_PREVIEWS: Record<string, QuotaReminderTemplate> = {
  default: {
    subject: '额度提醒：余额即将用尽',
    html: '<p>您好，{{username}}：</p><p>您的余额仅剩 <strong>{{remaining_quota}}</strong>，已低于提醒阈值 <strong>{{threshold}}</strong>。</p><p>请及时充值：<a href="{{top_up_url}}">{{top_up_url}}</a></p>',
    text: '您好，{{username}}：\n您的余额仅剩 {{remaining_quota}}，已低于提醒阈值 {{threshold}}。\n请及时充值：{{top_up_url}}',
  },
  concise: {
    subject: '余额不足提醒',
    html: '<p>{{username}}，您的余额为 {{remaining_quota}}，低于阈值 {{threshold}}。<a href="{{top_up_url}}">立即充值</a></p>',
    text: '{{username}}，您的余额为 {{remaining_quota}}，低于阈值 {{threshold}}。立即充值：{{top_up_url}}',
  },
}

function parseCustomTemplate(value: string): QuotaReminderTemplate {
  if (!value.trim()) return EMPTY_CUSTOM_TEMPLATE
  try {
    return quotaReminderTemplateSchema.parse(JSON.parse(value))
  } catch {
    return EMPTY_CUSTOM_TEMPLATE
  }
}

function renderTemplatePreview(value: string): string {
  const examples: Record<string, string> = {
    username: 'Alex',
    remaining_quota: '$0.72',
    threshold: '$1.00',
    currency_symbol: '$',
    top_up_url: '/wallet',
    site_name: 'New API',
  }
  return value.replaceAll(/{{\s*([a-z_]+)\s*}}/g, (_, name: string) => {
    return examples[name] ?? `{{${name}}}`
  })
}

const createMonitoringSchema = (t: (key: string) => string) => {
  const numericString = z.string().refine((value) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    return !Number.isNaN(Number(trimmed)) && Number(trimmed) >= 0
  }, t('Enter a non-negative number or leave empty'))

  const positiveNumericString = z.string().refine((value) => {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) && parsed > 0
  }, t('Enter a number greater than zero'))

  return z
    .object({
      QuotaRemindEnabled: z.boolean(),
      QuotaRemindThreshold: numericString,
      QuotaRemindTemplate: z.enum(['default', 'concise', 'custom']),
      QuotaRemindCustomSubject: z.string(),
      QuotaRemindCustomHtml: z.string(),
      QuotaRemindCustomText: z.string(),
      perf_metrics_setting: z.object({
        enabled: z.boolean(),
        flush_interval: z.coerce.number().min(1),
        bucket_time: z.enum(['minute', '5min', 'hour']),
        retention_days: z.coerce.number().min(0),
      }),
      error_alert_setting: z.object({
        enabled: z.boolean(),
        wecom_webhook_url: z.string(),
        interval_seconds: z.coerce.number().min(30),
        min_count: z.coerce.number().min(1),
        top_n: z.coerce.number().min(1),
        model_filter: z.string(),
        channel_filter: z.string(),
      }),
    })
    .superRefine((values, context) => {
      if (!values.QuotaRemindEnabled) return
      if (
        !positiveNumericString.safeParse(values.QuotaRemindThreshold).success
      ) {
        context.addIssue({
          code: 'custom',
          path: ['QuotaRemindThreshold'],
          message: t('Enter a number greater than zero'),
        })
      }
      if (values.QuotaRemindTemplate !== 'custom') return
      const requiredFields = [
        ['QuotaRemindCustomSubject', values.QuotaRemindCustomSubject],
        ['QuotaRemindCustomHtml', values.QuotaRemindCustomHtml],
        ['QuotaRemindCustomText', values.QuotaRemindCustomText],
      ] as const
      requiredFields.forEach(([path, value]) => {
        if (!value.trim()) {
          context.addIssue({
            code: 'custom',
            path: [path],
            message: t('This field is required for a custom template'),
          })
        }
      })
    })
}

type MonitoringSchema = ReturnType<typeof createMonitoringSchema>
type MonitoringFormInput = z.input<MonitoringSchema>
type MonitoringFormValues = z.output<MonitoringSchema>

type FlatMonitoringDefaults = {
  QuotaRemindEnabled: boolean
  QuotaRemindThreshold: string
  QuotaRemindThresholdUnit: string
  QuotaRemindThresholdQuotaPerUnit: string
  QuotaRemindThresholdUSDRate: string
  QuotaRemindThresholdCustomRate: string
  QuotaRemindTemplate: string
  QuotaRemindCustomTemplate: string
  'perf_metrics_setting.enabled': boolean
  'perf_metrics_setting.flush_interval': number
  'perf_metrics_setting.bucket_time': 'minute' | '5min' | 'hour'
  'perf_metrics_setting.retention_days': number
  'error_alert_setting.enabled': boolean
  'error_alert_setting.wecom_webhook_url': string
  'error_alert_setting.interval_seconds': number
  'error_alert_setting.min_count': number
  'error_alert_setting.top_n': number
  'error_alert_setting.model_filter': string
  'error_alert_setting.channel_filter': string
}

type MonitoringSettingsSectionProps = {
  defaultValues: FlatMonitoringDefaults
}

const buildFormDefaults = (
  defaults: MonitoringSettingsSectionProps['defaultValues']
): MonitoringFormInput => ({
  QuotaRemindEnabled: defaults.QuotaRemindEnabled ?? true,
  QuotaRemindThreshold: defaults.QuotaRemindThreshold ?? '',
  QuotaRemindTemplate: (defaults.QuotaRemindTemplate || 'default') as
    | 'default'
    | 'concise'
    | 'custom',
  ...(() => {
    const custom = parseCustomTemplate(defaults.QuotaRemindCustomTemplate)
    return {
      QuotaRemindCustomSubject: custom.subject,
      QuotaRemindCustomHtml: custom.html,
      QuotaRemindCustomText: custom.text,
    }
  })(),
  perf_metrics_setting: {
    enabled: defaults['perf_metrics_setting.enabled'],
    flush_interval: defaults['perf_metrics_setting.flush_interval'],
    bucket_time: defaults['perf_metrics_setting.bucket_time'],
    retention_days: defaults['perf_metrics_setting.retention_days'],
  },
  error_alert_setting: {
    enabled: defaults['error_alert_setting.enabled'],
    wecom_webhook_url: defaults['error_alert_setting.wecom_webhook_url'],
    interval_seconds: defaults['error_alert_setting.interval_seconds'],
    min_count: defaults['error_alert_setting.min_count'],
    top_n: defaults['error_alert_setting.top_n'],
    model_filter: defaults['error_alert_setting.model_filter'],
    channel_filter: defaults['error_alert_setting.channel_filter'],
  },
})

const normalizeDefaults = (
  defaults: MonitoringSettingsSectionProps['defaultValues']
): FlatMonitoringDefaults => ({
  QuotaRemindEnabled: defaults.QuotaRemindEnabled ?? true,
  QuotaRemindThreshold: (defaults.QuotaRemindThreshold ?? '').trim(),
  QuotaRemindThresholdUnit: defaults.QuotaRemindThresholdUnit || 'USD',
  QuotaRemindThresholdQuotaPerUnit:
    defaults.QuotaRemindThresholdQuotaPerUnit || '500000',
  QuotaRemindThresholdUSDRate: defaults.QuotaRemindThresholdUSDRate || '1',
  QuotaRemindThresholdCustomRate:
    defaults.QuotaRemindThresholdCustomRate || '1',
  QuotaRemindTemplate: defaults.QuotaRemindTemplate || 'default',
  QuotaRemindCustomTemplate: defaults.QuotaRemindCustomTemplate || '',
  'perf_metrics_setting.enabled': defaults['perf_metrics_setting.enabled'],
  'perf_metrics_setting.flush_interval':
    defaults['perf_metrics_setting.flush_interval'],
  'perf_metrics_setting.bucket_time':
    defaults['perf_metrics_setting.bucket_time'],
  'perf_metrics_setting.retention_days':
    defaults['perf_metrics_setting.retention_days'],
  'error_alert_setting.enabled': defaults['error_alert_setting.enabled'],
  'error_alert_setting.wecom_webhook_url': (
    defaults['error_alert_setting.wecom_webhook_url'] ?? ''
  ).trim(),
  'error_alert_setting.interval_seconds':
    defaults['error_alert_setting.interval_seconds'],
  'error_alert_setting.min_count': defaults['error_alert_setting.min_count'],
  'error_alert_setting.top_n': defaults['error_alert_setting.top_n'],
  'error_alert_setting.model_filter': (
    defaults['error_alert_setting.model_filter'] ?? ''
  ).trim(),
  'error_alert_setting.channel_filter': (
    defaults['error_alert_setting.channel_filter'] ?? ''
  ).trim(),
})

function displayReminderThresholdInCurrentUnit(
  defaults: MonitoringSettingsSectionProps['defaultValues'],
  currency: CurrencyConfig
): FlatMonitoringDefaults {
  const normalizedDefaults = normalizeDefaults(defaults)
  const savedThreshold = Number(normalizedDefaults.QuotaRemindThreshold)
  const savedQuotaPerUnit = Number(
    normalizedDefaults.QuotaRemindThresholdQuotaPerUnit
  )
  const savedUsdRate = Number(normalizedDefaults.QuotaRemindThresholdUSDRate)
  const savedCustomRate = Number(
    normalizedDefaults.QuotaRemindThresholdCustomRate
  )
  const savedUnit = normalizedDefaults.QuotaRemindThresholdUnit
  if (!['USD', 'CNY', 'CUSTOM', 'TOKENS'].includes(savedUnit)) {
    return normalizedDefaults
  }
  const displayedThreshold = convertDisplayedQuotaBetweenSnapshots(
    savedThreshold,
    {
      quotaDisplayType: savedUnit as CurrencyConfig['quotaDisplayType'],
      quotaPerUnit: savedQuotaPerUnit,
      usdExchangeRate: savedUsdRate,
      customCurrencyExchangeRate: savedCustomRate,
    },
    currency
  )
  if (displayedThreshold === null) return normalizedDefaults

  return {
    ...normalizedDefaults,
    QuotaRemindThreshold: String(displayedThreshold),
    QuotaRemindThresholdUnit: currency.quotaDisplayType,
    QuotaRemindThresholdQuotaPerUnit: String(currency.quotaPerUnit),
    QuotaRemindThresholdUSDRate: String(currency.usdExchangeRate),
    QuotaRemindThresholdCustomRate: String(currency.customCurrencyExchangeRate),
  }
}

const normalizeFormValues = (
  values: MonitoringFormValues,
  baseline: FlatMonitoringDefaults,
  thresholdSnapshot: Pick<
    FlatMonitoringDefaults,
    | 'QuotaRemindThresholdUnit'
    | 'QuotaRemindThresholdQuotaPerUnit'
    | 'QuotaRemindThresholdUSDRate'
    | 'QuotaRemindThresholdCustomRate'
  >
): FlatMonitoringDefaults => ({
  QuotaRemindEnabled: values.QuotaRemindEnabled,
  ...thresholdSnapshot,
  QuotaRemindThreshold: values.QuotaRemindThreshold.trim(),
  QuotaRemindTemplate: values.QuotaRemindTemplate,
  QuotaRemindCustomTemplate:
    values.QuotaRemindTemplate === 'custom'
      ? JSON.stringify({
          subject: values.QuotaRemindCustomSubject.trim(),
          html: values.QuotaRemindCustomHtml,
          text: values.QuotaRemindCustomText,
        })
      : baseline.QuotaRemindCustomTemplate,
  'perf_metrics_setting.enabled': values.perf_metrics_setting.enabled,
  'perf_metrics_setting.flush_interval':
    values.perf_metrics_setting.flush_interval,
  'perf_metrics_setting.bucket_time': values.perf_metrics_setting.bucket_time,
  'perf_metrics_setting.retention_days':
    values.perf_metrics_setting.retention_days,
  'error_alert_setting.enabled': values.error_alert_setting.enabled,
  'error_alert_setting.wecom_webhook_url':
    values.error_alert_setting.wecom_webhook_url.trim(),
  'error_alert_setting.interval_seconds':
    values.error_alert_setting.interval_seconds,
  'error_alert_setting.min_count': values.error_alert_setting.min_count,
  'error_alert_setting.top_n': values.error_alert_setting.top_n,
  'error_alert_setting.model_filter':
    values.error_alert_setting.model_filter.trim(),
  'error_alert_setting.channel_filter':
    values.error_alert_setting.channel_filter.trim(),
})

export function MonitoringSettingsSection({
  defaultValues,
}: MonitoringSettingsSectionProps) {
  const { t } = useTranslation()
  const monitoringSchema = useMemo(() => createMonitoringSchema(t), [t])
  const updateOption = useUpdateOption({ invalidateOnSuccess: false })
  const queryClient = useQueryClient()
  const quotaReminderMutation = useMutation({
    mutationFn: updateQuotaReminderConfig,
    onSuccess: () => {
      toast.success(t('Setting updated successfully'))
    },
    onError: (error: Error) => {
      toast.error(
        error.message || t('Failed to update quota reminder settings')
      )
    },
  })
  const currency = useSystemConfigStore((state) => state.config.currency)
  const displayedDefaults = useMemo(
    () => displayReminderThresholdInCurrentUnit(defaultValues, currency),
    [currency, defaultValues]
  )
  const baselineRef = useRef<FlatMonitoringDefaults>(displayedDefaults)
  const baselineSerializedRef = useRef<string>(
    JSON.stringify(displayedDefaults)
  )
  const isSavingRef = useRef(false)

  const formDefaults = useMemo(
    () => buildFormDefaults(displayedDefaults),
    [displayedDefaults]
  )

  const form = useForm<MonitoringFormInput, unknown, MonitoringFormValues>({
    resolver: zodResolver(monitoringSchema),
    defaultValues: formDefaults,
  })

  useResetForm(form, formDefaults)

  useEffect(() => {
    if (isSavingRef.current) return
    const serialized = JSON.stringify(displayedDefaults)
    if (serialized === baselineSerializedRef.current) return
    baselineRef.current = displayedDefaults
    baselineSerializedRef.current = serialized
  }, [displayedDefaults])

  const perfMetricsEnabled = form.watch('perf_metrics_setting.enabled')
  const errorAlertEnabled = form.watch('error_alert_setting.enabled')
  const quotaReminderEnabled = form.watch('QuotaRemindEnabled')
  const quotaReminderTemplate = form.watch('QuotaRemindTemplate')
  const customTemplateSubject = form.watch('QuotaRemindCustomSubject')
  const customTemplateHtml = form.watch('QuotaRemindCustomHtml')
  const customTemplateText = form.watch('QuotaRemindCustomText')
  const webhookUrl = form.watch('error_alert_setting.wecom_webhook_url')
  const [testingWecom, setTestingWecom] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [testingQuotaEmail, setTestingQuotaEmail] = useState(false)

  const thresholdSnapshot = useMemo(() => {
    return {
      QuotaRemindThresholdUnit: currency.quotaDisplayType,
      QuotaRemindThresholdQuotaPerUnit: String(currency.quotaPerUnit),
      QuotaRemindThresholdUSDRate: String(currency.usdExchangeRate),
      QuotaRemindThresholdCustomRate: String(
        currency.customCurrencyExchangeRate
      ),
    }
  }, [currency])

  const thresholdUnitLabel = useMemo(() => {
    if (currency.quotaDisplayType === 'TOKENS') {
      return t('Tokens')
    }
    if (currency.quotaDisplayType === 'CUSTOM') {
      return getCurrencyLabel()
    }
    return currency.quotaDisplayType
  }, [currency.quotaDisplayType, t])

  const templatePreview = useMemo(() => {
    if (quotaReminderTemplate === 'custom') {
      return {
        subject: customTemplateSubject,
        html: customTemplateHtml,
        text: customTemplateText,
      }
    }
    return BUILT_IN_TEMPLATE_PREVIEWS[quotaReminderTemplate]
  }, [
    customTemplateHtml,
    customTemplateSubject,
    customTemplateText,
    quotaReminderTemplate,
  ])

  const handleTestQuotaEmail = async () => {
    const recipient = testRecipient.trim()
    if (!recipient) {
      toast.error(t('Please enter a test recipient email'))
      return
    }
    setTestingQuotaEmail(true)
    try {
      const res = await sendQuotaReminderTestEmail(recipient)
      if (res.success) {
        toast.success(t('Low balance test email sent'))
      } else {
        toast.error(res.message || t('Failed to send test email'))
      }
    } catch {
      // Errors are surfaced by the global response interceptor.
    } finally {
      setTestingQuotaEmail(false)
    }
  }

  const handleTestWecom = async () => {
    const url = (webhookUrl ?? '').trim()
    if (!url) {
      toast.error(t('Please enter the WeCom bot webhook URL first'))
      return
    }
    setTestingWecom(true)
    try {
      const res = await api.post('/api/log/error_alert_test', {
        webhook_url: url,
      })
      if (res.data?.success) {
        toast.success(t('Test message sent, please check WeCom'))
      }
    } catch {
      // errors are surfaced by the global response interceptor
    } finally {
      setTestingWecom(false)
    }
  }

  const onSubmit = async (values: MonitoringFormValues) => {
    const thresholdChanged =
      values.QuotaRemindThreshold.trim() !==
      baselineRef.current.QuotaRemindThreshold
    const savedThresholdSnapshot = {
      QuotaRemindThresholdUnit: baselineRef.current.QuotaRemindThresholdUnit,
      QuotaRemindThresholdQuotaPerUnit:
        baselineRef.current.QuotaRemindThresholdQuotaPerUnit,
      QuotaRemindThresholdUSDRate:
        baselineRef.current.QuotaRemindThresholdUSDRate,
      QuotaRemindThresholdCustomRate:
        baselineRef.current.QuotaRemindThresholdCustomRate,
    }
    const normalized = normalizeFormValues(
      values,
      baselineRef.current,
      thresholdChanged ? thresholdSnapshot : savedThresholdSnapshot
    )
    const updates = (
      Object.keys(normalized) as Array<keyof FlatMonitoringDefaults>
    ).filter((key) => normalized[key] !== baselineRef.current[key])

    const reminderKeys = new Set<keyof FlatMonitoringDefaults>([
      'QuotaRemindEnabled',
      'QuotaRemindThreshold',
      'QuotaRemindTemplate',
      'QuotaRemindCustomTemplate',
    ])
    const reminderSnapshotKeys = new Set<keyof FlatMonitoringDefaults>([
      'QuotaRemindThresholdUnit',
      'QuotaRemindThresholdQuotaPerUnit',
      'QuotaRemindThresholdUSDRate',
      'QuotaRemindThresholdCustomRate',
    ])
    const reminderChanged = updates.some((key) => reminderKeys.has(key))
    const genericUpdates = updates.filter(
      (key) => !reminderKeys.has(key) && !reminderSnapshotKeys.has(key)
    )

    if (!reminderChanged && genericUpdates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    isSavingRef.current = true
    try {
      if (reminderChanged) {
        const threshold = Number(normalized.QuotaRemindThreshold)
        if (!Number.isFinite(threshold) || threshold <= 0) {
          toast.error(t('Enter a number greater than zero'))
          return
        }
        await quotaReminderMutation.mutateAsync({
          enabled: normalized.QuotaRemindEnabled,
          threshold,
          template: normalized.QuotaRemindTemplate as QuotaReminderTemplateId,
          custom_template: normalized.QuotaRemindCustomTemplate,
        })
      }

      for (const key of genericUpdates) {
        const result = await updateOption.mutateAsync({
          key,
          value: normalized[key],
        })
        if (!result.success) {
          const message = result.message || t('Failed to update setting')
          toast.error(message)
          throw new Error(message)
        }
      }
    } catch {
      return
    } finally {
      isSavingRef.current = false
    }

    baselineRef.current = normalized
    baselineSerializedRef.current = JSON.stringify(normalized)
    queryClient.invalidateQueries({ queryKey: ['system-options'] })
  }

  return (
    <SettingsSection title={t('Monitoring & Alerts')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || quotaReminderMutation.isPending}
          />
          <div>
            <h4 className='font-medium'>{t('Low balance email reminder')}</h4>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                'Email users once when their balance crosses below the configured threshold.'
              )}
            </p>
          </div>

          <FormField
            control={form.control}
            name='QuotaRemindEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable low balance reminders')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Users can override the global threshold in their profile.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label={t('Enable low balance reminders')}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='QuotaRemindThreshold'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('Global reminder threshold ({{unit}})', {
                      unit: thresholdUnitLabel,
                    })}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={getEditableQuotaStep()}
                      step={getEditableQuotaStep()}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      disabled={!quotaReminderEnabled}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'The unit and exchange-rate snapshot are saved with this value.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='QuotaRemindTemplate'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Email template')}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!quotaReminderEnabled}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value='default'>
                          {t('Detailed reminder')}
                        </SelectItem>
                        <SelectItem value='concise'>
                          {t('Concise reminder')}
                        </SelectItem>
                        <SelectItem value='custom'>
                          {t('Custom template')}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('Choose the message sent for low balance reminders.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {quotaReminderTemplate === 'custom' && (
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              <div className='space-y-4'>
                <FormField
                  control={form.control}
                  name='QuotaRemindCustomSubject'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Email subject')}</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!quotaReminderEnabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='QuotaRemindCustomHtml'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('HTML body')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className='min-h-32 font-mono text-xs'
                          disabled={!quotaReminderEnabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='QuotaRemindCustomText'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Plain text body')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className='min-h-24 font-mono text-xs'
                          disabled={!quotaReminderEnabled}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Available template variables')}: {'{{username}}'},{' '}
                        {'{{remaining_quota}}'}, {'{{threshold}}'},{' '}
                        {'{{currency_symbol}}'}, {'{{top_up_url}}'},{' '}
                        {'{{site_name}}'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className='space-y-2'>
                <FormLabel>{t('Template preview')}</FormLabel>
                <div className='bg-muted/40 min-h-48 rounded-lg border p-4'>
                  <p className='text-sm font-semibold'>
                    {renderTemplatePreview(templatePreview.subject) ||
                      t('Email subject')}
                  </p>
                  <p className='text-muted-foreground mt-3 text-sm whitespace-pre-wrap'>
                    {renderTemplatePreview(templatePreview.text) ||
                      t('Plain text body')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {quotaReminderTemplate !== 'custom' && (
            <div className='bg-muted/40 rounded-lg border p-4'>
              <p className='text-xs font-medium'>{t('Template preview')}</p>
              <p className='mt-2 text-sm font-semibold'>
                {renderTemplatePreview(templatePreview.subject)}
              </p>
              <p className='text-muted-foreground mt-2 text-sm whitespace-pre-wrap'>
                {renderTemplatePreview(templatePreview.text)}
              </p>
            </div>
          )}

          <div className='grid gap-2'>
            <Label htmlFor='quota-reminder-test-recipient'>
              {t('Test recipient')}
            </Label>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <Input
                id='quota-reminder-test-recipient'
                type='email'
                value={testRecipient}
                onChange={(event) => setTestRecipient(event.target.value)}
                placeholder={t('name@example.com')}
                disabled={!quotaReminderEnabled || testingQuotaEmail}
              />
              <Button
                type='button'
                variant='outline'
                onClick={handleTestQuotaEmail}
                disabled={
                  !quotaReminderEnabled ||
                  testingQuotaEmail ||
                  !testRecipient.trim()
                }
              >
                {testingQuotaEmail ? t('Sending...') : t('Send test email')}
              </Button>
            </div>
            <p className='text-muted-foreground text-sm'>
              {t('Sends the currently saved reminder template using SMTP.')}
            </p>
          </div>

          <div className='border-t' />

          <div>
            <h4 className='font-medium'>{t('Model performance metrics')}</h4>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                'Collect relay latency and success-rate metrics for the model square.'
              )}
            </p>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
            <FormField
              control={form.control}
              name='perf_metrics_setting.enabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>
                      {t('Enable model performance metrics')}
                    </FormLabel>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
            <FormField
              control={form.control}
              name='perf_metrics_setting.flush_interval'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Flush interval (minutes)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={1}
                      step={1}
                      {...safeNumberFieldProps(field)}
                      disabled={!perfMetricsEnabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='perf_metrics_setting.bucket_time'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Aggregation bucket')}</FormLabel>
                  <Select
                    items={[
                      { value: 'minute', label: t('1 minute') },
                      { value: '5min', label: t('5 minutes') },
                      { value: 'hour', label: t('1 hour') },
                    ]}
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!perfMetricsEnabled}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value='minute'>{t('1 minute')}</SelectItem>
                        <SelectItem value='5min'>{t('5 minutes')}</SelectItem>
                        <SelectItem value='hour'>{t('1 hour')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='perf_metrics_setting.retention_days'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Retention days')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      {...safeNumberFieldProps(field)}
                      disabled={!perfMetricsEnabled}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('0 means data is kept permanently')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div>
            <h4 className='font-medium'>{t('Error alerts (WeCom bot)')}</h4>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                'Periodically aggregate request-level errors and push them to a WeCom group bot.'
              )}
            </p>
          </div>

          <FormField
            control={form.control}
            name='error_alert_setting.enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable error alerts')}</FormLabel>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <FormField
            control={form.control}
            name='error_alert_setting.wecom_webhook_url'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('WeCom bot webhook URL')}</FormLabel>
                <div className='flex items-center gap-2'>
                  <FormControl>
                    <Input
                      type='url'
                      placeholder='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...'
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      disabled={!errorAlertEnabled}
                    />
                  </FormControl>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={handleTestWecom}
                    disabled={
                      !errorAlertEnabled ||
                      testingWecom ||
                      !(field.value ?? '').trim()
                    }
                  >
                    {testingWecom ? t('Sending...') : t('Send test')}
                  </Button>
                </div>
                <FormDescription>
                  {t(
                    'Group bot address from WeCom: Group settings -> Group robots -> Add.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
            <FormField
              control={form.control}
              name='error_alert_setting.interval_seconds'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Aggregation interval (seconds)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={30}
                      step={1}
                      {...safeNumberFieldProps(field)}
                      disabled={!errorAlertEnabled}
                    />
                  </FormControl>
                  <FormDescription>{t('Minimum 30 seconds')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='error_alert_setting.min_count'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Minimum errors to alert')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={1}
                      step={1}
                      {...safeNumberFieldProps(field)}
                      disabled={!errorAlertEnabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='error_alert_setting.top_n'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Top error types shown')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={1}
                      step={1}
                      {...safeNumberFieldProps(field)}
                      disabled={!errorAlertEnabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='error_alert_setting.model_filter'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Model filter (optional)')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('Comma-separated, empty means all')}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      disabled={!errorAlertEnabled}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Only alert errors whose model name contains these.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='error_alert_setting.channel_filter'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Channel filter (optional)')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        'Comma-separated channel IDs, empty means all'
                      )}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      disabled={!errorAlertEnabled}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Only alert errors from these channel IDs.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
