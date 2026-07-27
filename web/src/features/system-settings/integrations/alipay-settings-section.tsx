/*
Copyright (C) 2025 QuantumNous

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
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'

const alipaySchema = z.object({
  AlipayEnabled: z.boolean(),
  AlipayAppId: z.string(),
  AlipayPrivateKey: z.string(),
  AlipayPublicKey: z.string(),
  AlipayProduction: z.boolean(),
  AlipayMinTopUp: z.number().min(0),
})

export type AlipaySettingsValues = z.infer<typeof alipaySchema>

type AlipaySettingsSectionProps = {
  defaultValues: AlipaySettingsValues
}

export function AlipaySettingsSection({
  defaultValues,
}: AlipaySettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<AlipaySettingsValues>({
    resolver: zodResolver(alipaySchema),
    defaultValues,
  })

  useResetForm(form, defaultValues)

  const onSubmit = async (values: AlipaySettingsValues) => {
    const updates: Array<{ key: string; value: string | boolean }> = []

    if (values.AlipayEnabled !== defaultValues.AlipayEnabled) {
      updates.push({ key: 'AlipayEnabled', value: values.AlipayEnabled })
    }
    if (values.AlipayProduction !== defaultValues.AlipayProduction) {
      updates.push({ key: 'AlipayProduction', value: values.AlipayProduction })
    }
    if (values.AlipayAppId.trim() !== defaultValues.AlipayAppId.trim()) {
      updates.push({ key: 'AlipayAppId', value: values.AlipayAppId.trim() })
    }
    if (values.AlipayPrivateKey.trim() !== '') {
      updates.push({
        key: 'AlipayPrivateKey',
        value: values.AlipayPrivateKey.trim(),
      })
    }
    if (values.AlipayPublicKey.trim() !== '') {
      updates.push({
        key: 'AlipayPublicKey',
        value: values.AlipayPublicKey.trim(),
      })
    }
    if (values.AlipayMinTopUp !== defaultValues.AlipayMinTopUp) {
      updates.push({
        key: 'AlipayMinTopUp',
        value: String(values.AlipayMinTopUp),
      })
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
  }

  return (
    <SettingsSection title={t('Alipay')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save Alipay settings'
          />

          <FormField
            control={form.control}
            name='AlipayEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable Alipay')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Callback path: /api/user/alipay/notify (configure on the Alipay open platform).'
                    )}
                  </FormDescription>
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
            name='AlipayAppId'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('App ID')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('Alipay open platform application App ID')}
                    autoComplete='off'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='AlipayProduction'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Production environment')}</FormLabel>
                  <FormDescription>
                    {t('Turn off to use the sandbox environment.')}
                  </FormDescription>
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
            name='AlipayMinTopUp'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Minimum top-up amount')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={0}
                    {...field}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ''
                          ? 1
                          : event.target.valueAsNumber
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='AlipayPrivateKey'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Application private key')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder={t(
                      'Paste the application private key. Leave blank to keep the existing value.'
                    )}
                    autoComplete='off'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='AlipayPublicKey'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Alipay public key')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder={t(
                      'Paste the Alipay public key. Leave blank to keep the existing value.'
                    )}
                    autoComplete='off'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
