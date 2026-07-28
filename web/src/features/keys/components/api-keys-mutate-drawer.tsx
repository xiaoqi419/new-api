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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm, type SubmitErrorHandler } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/datetime-picker'
import { Dialog } from '@/components/dialog'
import { MultiSelect } from '@/components/multi-select'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { getUserModels, getUserGroups } from '@/lib/api'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'

import { createApiKey, updateApiKey, getApiKey } from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import {
  getApiKeyFormSchema,
  type ApiKeyFormValues,
  getApiKeyFormDefaultValues,
  transformFormDataToPayload,
  transformApiKeyToFormDefaults,
} from '../lib'
import type { ApiKey } from '../types'
import {
  ApiKeyGroupCombobox,
  type ApiKeyGroupOption,
} from './api-key-group-combobox'
import { useApiKeys } from './api-keys-provider'

const THRESHOLD_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: String(n),
}))
const COOLDOWN_OPTIONS = [5, 10, 30].map((n) => ({
  value: String(n),
  label: String(n),
}))

const switchItemClassName =
  'border-border/60 flex min-h-16 flex-row items-center justify-between gap-3 border-y py-3'

// Maps each form field to the tab that contains it, so validation errors can
// switch the user to the first tab that has a problem.
const FIELD_TAB: Record<string, string> = {
  name: 'basic',
  group: 'basic',
  group_switch_enabled: 'basic',
  group_switch_groups: 'basic',
  group_switch_threshold: 'basic',
  group_switch_cooldown: 'basic',
  expired_time: 'basic',
  tokenCount: 'basic',
  remain_quota_dollars: 'rate',
  unlimited_quota: 'rate',
  max_concurrency: 'rate',
  allow_ips: 'security',
  model_limits: 'advanced',
}

type ApiKeyMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: ApiKey
}

export function ApiKeysMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: ApiKeyMutateDrawerProps) {
  const { t } = useTranslation()
  const isUpdate = !!currentRow
  const { triggerRefresh } = useApiKeys()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')

  // Fetch models
  const { data: modelsData } = useQuery({
    queryKey: ['user-models'],
    queryFn: getUserModels,
    enabled: open,
    staleTime: 0,
  })

  // Fetch groups
  const { data: groupsData } = useQuery({
    queryKey: ['user-groups'],
    queryFn: getUserGroups,
    enabled: open,
    staleTime: 0,
  })

  const models = modelsData?.data || []
  const groupsRaw = groupsData?.data || {}
  const groups: ApiKeyGroupOption[] = Object.entries(groupsRaw).map(
    ([key, info]) => ({
      value: key,
      label: key,
      desc: info.desc || key,
      ratio: info.ratio,
    })
  )
  // Candidate options for auto-switch, ordered by ratio (cheapest first).
  const candidateGroupOptions = [...groups]
    .sort((a, b) => (Number(a.ratio) || 0) - (Number(b.ratio) || 0))
    .map((g) => ({
      value: g.value,
      label: typeof g.ratio === 'number' ? `${g.value} (×${g.ratio})` : g.value,
    }))
  const schema = getApiKeyFormSchema(t)

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getApiKeyFormDefaultValues(),
  })

  // Load existing data when updating
  useEffect(() => {
    if (open) {
      setActiveTab('basic')
    }
    if (open && isUpdate && currentRow) {
      void getApiKey(currentRow.id).then((result) => {
        if (result.success && result.data) {
          form.reset(transformApiKeyToFormDefaults(result.data))
        }
      })
    } else if (open && !isUpdate) {
      form.reset(getApiKeyFormDefaultValues())
    }
  }, [open, isUpdate, currentRow, form])

  // Correct fixed group after groups load: if the form value is not in
  // available groups, fall back to a valid one.
  useEffect(() => {
    if (groups.length === 0) return
    const currentGroup = form.getValues('group')
    if (currentGroup && !groups.some((g) => g.value === currentGroup)) {
      const fallback =
        groups.find((g) => g.value === 'default')?.value ??
        groups[0]?.value ??
        ''
      form.setValue('group', fallback)
    }
  }, [groups, form])

  const onSubmit = async (data: ApiKeyFormValues) => {
    setIsSubmitting(true)
    try {
      const basePayload = transformFormDataToPayload(data)

      if (isUpdate && currentRow) {
        const result = await updateApiKey({
          ...basePayload,
          id: currentRow.id,
        })
        if (result.success) {
          toast.success(t(SUCCESS_MESSAGES.API_KEY_UPDATED))
          onOpenChange(false)
          triggerRefresh()
        } else {
          toast.error(result.message || t(ERROR_MESSAGES.UPDATE_FAILED))
        }
      } else {
        // Create mode - handle batch creation
        const count = data.tokenCount || 1
        let successCount = 0

        for (let i = 0; i < count; i++) {
          const result = await createApiKey({
            ...basePayload,
            name:
              i === 0 && data.name
                ? data.name
                : `${data.name || 'default'}-${Math.random().toString(36).slice(2, 8)}`,
          })
          if (result.success) {
            successCount++
          } else {
            toast.error(result.message || t(ERROR_MESSAGES.CREATE_FAILED))
            break
          }
        }

        if (successCount > 0) {
          toast.success(
            t('Successfully created {{count}} API Key(s)', {
              count: successCount,
            })
          )
          onOpenChange(false)
          triggerRefresh()
        }
      }
    } catch {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onInvalid: SubmitErrorHandler<ApiKeyFormValues> = (errors) => {
    const firstField = Object.keys(errors)[0]
    const tab = firstField ? FIELD_TAB[firstField] : undefined
    if (tab) {
      setActiveTab(tab)
    }
    toast.error(t('Please fix the highlighted fields before saving'))
  }

  const handleSetExpiry = (months: number, days: number, hours: number) => {
    if (months === 0 && days === 0 && hours === 0) {
      form.setValue('expired_time', undefined)
      return
    }

    const now = new Date()
    now.setMonth(now.getMonth() + months)
    now.setDate(now.getDate() + days)
    now.setHours(now.getHours() + hours)

    form.setValue('expired_time', now)
  }

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const quotaLabel = t('Quota ({{currency}})', { currency: currencyLabel })
  const quotaPlaceholder = tokensOnly
    ? t('Enter quota in tokens')
    : t('Enter quota in {{currency}}', { currency: currencyLabel })
  const groupSwitchEnabled = form.watch('group_switch_enabled')
  const unlimitedQuota = form.watch('unlimited_quota')

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
        }
      }}
      title={isUpdate ? t('Update API Key') : t('Create API Key')}
      description={
        isUpdate
          ? t('Update the API key by providing necessary info.')
          : t('Add a new API key by providing necessary info.')
      }
      contentClassName='sm:max-w-[600px]'
      contentHeight='420px'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            className='w-full sm:w-auto'
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('Close')}
          </Button>
          <Button
            type='submit'
            form='api-key-form'
            disabled={isSubmitting}
            className='w-full sm:w-auto'
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id='api-key-form'
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          className='flex flex-col gap-4'
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(String(v))}
          >
            <TabsList className='w-full flex-wrap justify-start'>
              <TabsTrigger value='basic'>{t('Basic Information')}</TabsTrigger>
              <TabsTrigger value='rate'>{t('Rate & Quota')}</TabsTrigger>
              <TabsTrigger value='security'>
                {t('Security Settings')}
              </TabsTrigger>
              <TabsTrigger value='advanced'>
                {t('Advanced Settings')}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value='basic'
              className='flex flex-col gap-4 focus-visible:outline-none'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Name')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('Enter a name')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='group_switch_enabled'
                render={({ field }) => (
                  <FormItem className={switchItemClassName}>
                    <div className='flex flex-col gap-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Auto-switch groups')}
                      </FormLabel>
                      <FormDescription className='line-clamp-2 text-xs sm:line-clamp-none'>
                        {t(
                          'Pick multiple candidate groups; requests start from the cheapest and escalate to the next group on repeated failures.'
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {!groupSwitchEnabled && (
                <FormField
                  control={form.control}
                  name='group'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Group')}</FormLabel>
                      <FormControl>
                        <ApiKeyGroupCombobox
                          options={groups}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder={t('Select a group')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {groupSwitchEnabled && (
                <>
                  <FormField
                    control={form.control}
                    name='group_switch_groups'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Candidate groups')}</FormLabel>
                        <FormControl>
                          <MultiSelect
                            options={candidateGroupOptions}
                            selected={field.value ?? []}
                            onChange={field.onChange}
                            placeholder={t('Select at least 2 groups')}
                          />
                        </FormControl>
                        <FormDescription>
                          {t(
                            'Ordered automatically by ratio (low to high). Prefer groups on the same platform.'
                          )}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className='grid gap-4 sm:grid-cols-2'>
                    <FormField
                      control={form.control}
                      name='group_switch_threshold'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('Failure threshold per group')}
                          </FormLabel>
                          <FormControl>
                            <Select
                              items={THRESHOLD_OPTIONS}
                              value={String(field.value ?? 2)}
                              onValueChange={(v) =>
                                v !== null && field.onChange(Number(v))
                              }
                            >
                              <SelectTrigger className='w-full'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectGroup>
                                  {THRESHOLD_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormDescription>
                            {t(
                              'Retryable upstream failures allowed in a group before escalating to the next.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='group_switch_cooldown'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Cooldown (minutes)')}</FormLabel>
                          <FormControl>
                            <Select
                              items={COOLDOWN_OPTIONS}
                              value={String(field.value ?? 10)}
                              onValueChange={(v) =>
                                v !== null && field.onChange(Number(v))
                              }
                            >
                              <SelectTrigger className='w-full'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectGroup>
                                  {COOLDOWN_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormDescription>
                            {t(
                              'After escalating, later requests keep using the higher group for this long before rechecking the cheapest.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'Note: higher-ratio groups cost more. Escalated requests are billed at the group actually used.'
                    )}
                  </p>
                </>
              )}

              <FormField
                control={form.control}
                name='expired_time'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Expiration Time')}</FormLabel>
                    <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
                      <FormControl>
                        <DateTimePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('Never expires')}
                          className='min-w-0 [&_input[type=time]]:w-24 sm:[&_input[type=time]]:w-32'
                        />
                      </FormControl>
                      <div className='grid grid-cols-4 gap-2 sm:flex'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 0, 0)}
                        >
                          {t('Never')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(1, 0, 0)}
                        >
                          {t('1 Month')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 1, 0)}
                        >
                          {t('1 Day')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 0, 1)}
                        >
                          {t('1 Hour')}
                        </Button>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isUpdate && (
                <FormField
                  control={form.control}
                  name='tokenCount'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Quantity')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min='1'
                          placeholder={t('Number of keys to create')}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseInt(e.target.value, 10) || 1
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Create multiple API keys at once (random suffix will be added to names)'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </TabsContent>

            <TabsContent
              value='rate'
              className='flex flex-col gap-4 focus-visible:outline-none'
            >
              {!unlimitedQuota && (
                <FormField
                  control={form.control}
                  name='remain_quota_dollars'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{quotaLabel}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          step={tokensOnly ? 1 : 0.01}
                          placeholder={quotaPlaceholder}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {tokensOnly
                          ? t('Enter the quota amount in tokens')
                          : t('Enter the quota amount in {{currency}}', {
                              currency: currencyLabel,
                            })}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='unlimited_quota'
                render={({ field }) => (
                  <FormItem className={switchItemClassName}>
                    <div className='flex flex-col gap-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Unlimited Quota')}
                      </FormLabel>
                      <FormDescription className='text-xs'>
                        {t('Enable unlimited quota for this API key')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='max_concurrency'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Max Concurrency')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        step={1}
                        placeholder='0'
                        onChange={(e) =>
                          field.onChange(
                            Number.parseInt(e.target.value, 10) || 0
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Maximum simultaneous requests for this key (0 = unlimited)'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>

            <TabsContent
              value='security'
              className='flex flex-col gap-4 focus-visible:outline-none'
            >
              <FormField
                control={form.control}
                name='allow_ips'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('IP Whitelist (supports CIDR)')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className='min-h-20 resize-none'
                        placeholder={t(
                          'One IP per line (empty for no restriction)'
                        )}
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Do not over-trust this feature. IP may be spoofed. Please use with nginx, CDN and other gateways.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>

            <TabsContent
              value='advanced'
              className='flex flex-col gap-4 focus-visible:outline-none'
            >
              <FormField
                control={form.control}
                name='model_limits'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Model Limits')}</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={models.map((m) => ({
                          label: m,
                          value: m,
                        }))}
                        selected={field.value}
                        onChange={field.onChange}
                        placeholder={t('Select models (empty for allow all)')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Limit which models can be used with this key')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>
          </Tabs>
        </form>
      </Form>
    </Dialog>
  )
}
