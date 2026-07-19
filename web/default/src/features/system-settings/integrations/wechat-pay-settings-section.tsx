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
import { removeTrailingSlash } from './utils'

const wechatPaySchema = z.object({
  WechatPayEnabled: z.boolean(),
  WechatPayMchId: z.string(),
  WechatPayMinTopUp: z.number().min(0),
  WechatPayAppId: z.string(),
  WechatPayAppSecret: z.string(),
  WechatPayApiV3Key: z.string(),
  WechatPayCert: z.string(),
  WechatPayCertSerialNo: z.string(),
  WechatPayPrivateKey: z.string(),
  WechatPayNative: z.boolean(),
  WechatPayH5: z.boolean(),
  WechatPayJSAPI: z.boolean(),
  WechatPayNotifyUrl: z.string(),
})

export type WechatPaySettingsValues = z.infer<typeof wechatPaySchema>

type WechatPaySettingsSectionProps = {
  defaultValues: WechatPaySettingsValues
}

export function WechatPaySettingsSection({
  defaultValues,
}: WechatPaySettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<WechatPaySettingsValues>({
    resolver: zodResolver(wechatPaySchema),
    defaultValues,
  })

  useResetForm(form, defaultValues)

  const onSubmit = async (values: WechatPaySettingsValues) => {
    const updates: Array<{ key: string; value: string | boolean }> = []

    const boolKeys = [
      'WechatPayEnabled',
      'WechatPayNative',
      'WechatPayH5',
      'WechatPayJSAPI',
    ] as const
    for (const key of boolKeys) {
      if (values[key] !== defaultValues[key]) {
        updates.push({ key, value: values[key] })
      }
    }

    const notifyUrl = removeTrailingSlash(values.WechatPayNotifyUrl)
    const stringKeys: Array<[keyof WechatPaySettingsValues, string, string]> = [
      [
        'WechatPayMchId',
        values.WechatPayMchId.trim(),
        defaultValues.WechatPayMchId.trim(),
      ],
      [
        'WechatPayAppId',
        values.WechatPayAppId.trim(),
        defaultValues.WechatPayAppId.trim(),
      ],
      [
        'WechatPayCertSerialNo',
        values.WechatPayCertSerialNo.trim(),
        defaultValues.WechatPayCertSerialNo.trim(),
      ],
      [
        'WechatPayNotifyUrl',
        notifyUrl,
        removeTrailingSlash(defaultValues.WechatPayNotifyUrl),
      ],
    ]
    for (const [key, next, initial] of stringKeys) {
      if (next !== initial) {
        updates.push({ key, value: next })
      }
    }

    const secretKeys = [
      'WechatPayAppSecret',
      'WechatPayApiV3Key',
      'WechatPayCert',
      'WechatPayPrivateKey',
    ] as const
    for (const key of secretKeys) {
      const value = values[key].trim()
      if (value !== '') {
        updates.push({ key, value })
      }
    }

    if (values.WechatPayMinTopUp !== defaultValues.WechatPayMinTopUp) {
      updates.push({
        key: 'WechatPayMinTopUp',
        value: String(values.WechatPayMinTopUp),
      })
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
  }

  return (
    <SettingsSection title={t('WeChat Pay')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save WeChat Pay settings'
          />

          <FormField
            control={form.control}
            name='WechatPayEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable WeChat Pay')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Callback path: /api/user/wechatpay/notify (configure on the WeChat Pay merchant platform).'
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
            name='WechatPayMchId'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Merchant ID (MchID)')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('WeChat Pay merchant ID')}
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
            name='WechatPayMinTopUp'
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
            name='WechatPayAppId'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Official account AppID')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t(
                      'Service account AppID (required for JSAPI)'
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
            name='WechatPayAppSecret'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Service account AppSecret')}</FormLabel>
                <FormControl>
                  <Input
                    type='password'
                    placeholder={t(
                      'Only required for JSAPI. Leave blank to keep unchanged.'
                    )}
                    autoComplete='new-password'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('Not shown again after saving.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='WechatPayApiV3Key'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('APIv3 key')}</FormLabel>
                <FormControl>
                  <Input
                    type='password'
                    placeholder={t('Leave blank to keep unchanged')}
                    autoComplete='new-password'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('Not shown again after saving.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='WechatPayCert'
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('Public key certificate (apiclient_cert.pem)')}
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder={t(
                      'Paste the full certificate content; the serial number is parsed automatically. Leave blank to keep unchanged.'
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
            name='WechatPayCertSerialNo'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Merchant certificate serial number')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t(
                      'Optional; parsed automatically when a certificate is provided.'
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
            name='WechatPayPrivateKey'
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('Merchant private key (apiclient_key.pem)')}
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder={t(
                      'Paste the full private key content. Leave blank to keep unchanged.'
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
            name='WechatPayNative'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('NATIVE QR code payment')}</FormLabel>
                  <FormDescription>
                    {t('Displays a QR code on PC and mobile web.')}
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
            name='WechatPayH5'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('H5 payment')}</FormLabel>
                  <FormDescription>
                    {t('Opens WeChat from a mobile external browser.')}
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
            name='WechatPayJSAPI'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('JSAPI payment')}</FormLabel>
                  <FormDescription>
                    {t('Invoked inside WeChat; requires a service account.')}
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
            name='WechatPayNotifyUrl'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Payment callback base URL')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t(
                      'https://your-domain (leave blank to use the site address)'
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
