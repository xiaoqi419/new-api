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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

const numericString = z.string().refine((value) => {
  const trimmed = value.trim()
  if (!trimmed) return true
  return !Number.isNaN(Number(trimmed)) && Number(trimmed) >= 0
}, 'Enter a non-negative number or leave empty')

const monitoringSchema = z.object({
  QuotaRemindThreshold: numericString,
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

type MonitoringFormInput = z.input<typeof monitoringSchema>
type MonitoringFormValues = z.output<typeof monitoringSchema>

type FlatMonitoringDefaults = {
  QuotaRemindThreshold: string
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
  QuotaRemindThreshold: defaults.QuotaRemindThreshold ?? '',
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
  QuotaRemindThreshold: (defaults.QuotaRemindThreshold ?? '').trim(),
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

const normalizeFormValues = (
  values: MonitoringFormValues
): FlatMonitoringDefaults => ({
  QuotaRemindThreshold: values.QuotaRemindThreshold.trim(),
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
  const updateOption = useUpdateOption()
  const baselineRef = useRef<FlatMonitoringDefaults>(
    normalizeDefaults(defaultValues)
  )
  const baselineSerializedRef = useRef<string>(
    JSON.stringify(normalizeDefaults(defaultValues))
  )

  const formDefaults = useMemo(
    () => buildFormDefaults(defaultValues),
    [defaultValues]
  )

  const form = useForm<MonitoringFormInput, unknown, MonitoringFormValues>({
    resolver: zodResolver(monitoringSchema),
    defaultValues: formDefaults,
  })

  useResetForm(form, formDefaults)

  useEffect(() => {
    const normalized = normalizeDefaults(defaultValues)
    const serialized = JSON.stringify(normalized)
    if (serialized === baselineSerializedRef.current) return
    baselineRef.current = normalized
    baselineSerializedRef.current = serialized
  }, [defaultValues])

  const perfMetricsEnabled = form.watch('perf_metrics_setting.enabled')
  const errorAlertEnabled = form.watch('error_alert_setting.enabled')
  const webhookUrl = form.watch('error_alert_setting.wecom_webhook_url')
  const [testingWecom, setTestingWecom] = useState(false)

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
    const normalized = normalizeFormValues(values)
    const updates = (
      Object.keys(normalized) as Array<keyof FlatMonitoringDefaults>
    ).filter((key) => normalized[key] !== baselineRef.current[key])

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of updates) {
      await updateOption.mutateAsync({
        key,
        value: normalized[key],
      })
    }

    baselineRef.current = normalized
    baselineSerializedRef.current = JSON.stringify(normalized)
  }

  return (
    <SettingsSection title={t('Monitoring & Alerts')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          <FormField
            control={form.control}
            name='QuotaRemindThreshold'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Quota reminder (tokens)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={0}
                    step={1}
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormDescription>
                  {t('Send email alerts when a user falls below this quota')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

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
