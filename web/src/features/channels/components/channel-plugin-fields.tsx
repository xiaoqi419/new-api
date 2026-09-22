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
import { useQuery } from '@tanstack/react-query'
import { useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'

import { getTaskPluginOptions } from '../api'
import { CHANNEL_TYPE_NEW_API, CHANNEL_TYPE_TASK_PLUGIN } from '../constants'
import type { ChannelFormValues } from '../lib/channel-form'
import {
  getChannelPluginExtensions,
  supportsNewAPIUpstream,
} from '../lib/channel-plugin-extensions'
import { nextTaskPluginBaseUrl } from '../lib/task-plugin-base-url'
import { ResponsesWebSocketSetting } from './responses-websocket-setting'

export function ChannelPluginFields(props: {
  channelType: number
  disabled: boolean
}) {
  const { t } = useTranslation()
  const form = useFormContext<ChannelFormValues>()
  const plugins = useQuery({
    queryKey: ['task-plugin-options'],
    queryFn: getTaskPluginOptions,
    enabled: !props.disabled,
    retry: false,
  })
  const options = Array.isArray(plugins.data) ? plugins.data : []
  const bindings = form.watch('task_extend_plugin_keys') ?? []
  const extensions = getChannelPluginExtensions(
    props.channelType,
    options,
    bindings
  )

  return (
    <fieldset
      disabled={props.disabled}
      className='space-y-4 disabled:opacity-60'
    >
      {props.channelType === CHANNEL_TYPE_TASK_PLUGIN && (
        <FormField
          control={form.control}
          name='task_plugin_key'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Task plugin *')}</FormLabel>
              <FormControl>
                <Combobox
                  options={options.map((plugin) => ({
                    value: plugin.key,
                    label: plugin.name,
                  }))}
                  value={field.value ?? ''}
                  onValueChange={(key) => {
                    const plugin = options.find((item) => item.key === key)
                    if (!plugin || key === field.value) return
                    const previous = options.find(
                      (item) => item.key === field.value
                    )
                    field.onChange(key)
                    const baseUrl = nextTaskPluginBaseUrl(
                      form.getValues('base_url'),
                      previous?.baseUrl,
                      plugin.baseUrl
                    )
                    if (baseUrl !== null) {
                      form.setValue('base_url', baseUrl, { shouldDirty: true })
                    }
                    if (plugin.models.length) {
                      form.setValue('models', plugin.models.join(','), {
                        shouldDirty: true,
                      })
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {props.channelType === CHANNEL_TYPE_NEW_API && (
        <FormField
          control={form.control}
          name='task_extend_plugin_keys'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Plugin extensions')}</FormLabel>
              <MultiSelect
                options={options
                  .filter(supportsNewAPIUpstream)
                  .map((plugin) => ({ value: plugin.key, label: plugin.name }))}
                selected={field.value ?? []}
                onChange={(keys) => {
                  const previous = field.value ?? []
                  const removed = new Set(
                    options
                      .filter(
                        (plugin) =>
                          previous.includes(plugin.key) &&
                          !keys.includes(plugin.key)
                      )
                      .flatMap((plugin) => plugin.models)
                  )
                  const kept = new Set(
                    options
                      .filter((plugin) => keys.includes(plugin.key))
                      .flatMap((plugin) => plugin.models)
                  )
                  const models = form
                    .getValues('models')
                    .split(',')
                    .map((model) => model.trim())
                    .filter(
                      (model) =>
                        model && (!removed.has(model) || kept.has(model))
                    )
                  field.onChange(keys)
                  form.setValue(
                    'models',
                    [...new Set([...models, ...kept])].join(','),
                    { shouldDirty: true }
                  )
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {extensions.length > 0 && props.channelType !== CHANNEL_TYPE_NEW_API && (
        <FormItem>
          <FormLabel>{t('Plugin extensions')}</FormLabel>
          <MultiSelect
            options={extensions.flatMap((plugin) =>
              plugin.models.map((model) => ({ value: model, label: model }))
            )}
            selected={form.watch('models').split(',').filter(Boolean)}
            onChange={(models) =>
              form.setValue('models', models.join(','), { shouldDirty: true })
            }
          />
        </FormItem>
      )}
      {plugins.isError && (
        <div role='alert' className='text-destructive text-sm'>
          {t('Failed to load plugins')}
          <Button
            type='button'
            variant='outline'
            onClick={() => void plugins.refetch()}
          >
            {t('Retry')}
          </Button>
        </div>
      )}
      {props.channelType === 23 && (
        <FormField
          control={form.control}
          name='ollama_openai_chat'
          render={({ field }) => (
            <FormItem className='flex items-center justify-between gap-4'>
              <div>
                <FormLabel>
                  {t('Use OpenAI-compatible Ollama chat API')}
                </FormLabel>
                <FormDescription>
                  {t(
                    'Send chat completions to the OpenAI-compatible /v1/chat/completions instead of the native Ollama /api/chat'
                  )}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value === true}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      )}
      <ResponsesWebSocketSetting
        channelType={props.channelType}
        disabled={props.disabled}
      />
    </fieldset>
  )
}
