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
import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Plus, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  activityLotteryQueryKeys,
  adminCreateActivityLotteryRound,
  adminUpdateActivityLotteryRound,
} from '../api'
import {
  getActivityLotteryDraftDefaults,
  getActivityLotteryDraftSchema,
  toActivityLotteryDraftInput,
  type ActivityLotteryDraftFormValues,
} from '../lib/draft-form'
import {
  activityLotteryCurrencyFromCampaign,
  activityLotteryCurrencyFromConfig,
  formatActivityPrizeAmount,
  parseActivityPrizeAmount,
} from '../lib/money'
import type {
  ActivityLotteryCampaign,
  ActivityLotteryDraftInput,
} from '../types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign?: ActivityLotteryCampaign
}

export function ActivityLotteryDraftDrawer(props: Props) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const configuredCurrency = useSystemConfigStore(
    (state) => state.config.currency
  )
  const currency = useMemo(
    () =>
      props.campaign
        ? activityLotteryCurrencyFromCampaign(props.campaign)
        : activityLotteryCurrencyFromConfig(configuredCurrency),
    [props.campaign, configuredCurrency]
  )
  const queryClient = useQueryClient()
  const form = useForm<ActivityLotteryDraftFormValues>({
    resolver: zodResolver(getActivityLotteryDraftSchema(t, currency)),
    defaultValues: getActivityLotteryDraftDefaults(props.campaign, currency),
  })
  const prizeFields = useFieldArray({ control: form.control, name: 'prizes' })
  const prizes = useWatch({ control: form.control, name: 'prizes' }) ?? []

  useEffect(() => {
    if (props.open) {
      form.reset(getActivityLotteryDraftDefaults(props.campaign, currency))
    }
  }, [props.open, props.campaign, currency, form])

  const slots = prizes.reduce((sum, prize) => sum + Number(prize.count || 0), 0)
  const poolAmount = prizes.reduce(
    (sum, prize) =>
      sum +
      Number(prize.count || 0) *
        (parseActivityPrizeAmount(prize.amountDisplay, currency) ?? 0),
    0
  )

  const saveMutation = useMutation({
    mutationFn: (input: ActivityLotteryDraftInput) =>
      props.campaign
        ? adminUpdateActivityLotteryRound(props.campaign.id, input)
        : adminCreateActivityLotteryRound(input),
    onSuccess: () => {
      toast.success(t('Draft saved'))
      void queryClient.invalidateQueries({
        queryKey: activityLotteryQueryKeys.admin(1).slice(0, 2),
      })
      props.onOpenChange(false)
    },
  })

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className={sideDrawerContentClassName('sm:max-w-2xl')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {props.campaign ? t('Edit draft') : t('Create recharge lottery')}
          </SheetTitle>
          <SheetDescription>
            {t(
              'A successful wallet top-up from the participation start date until the draw time gives each account one entry. Publishing locks the rules and prize values.'
            )}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='activity-lottery-draft-form'
            className={sideDrawerFormClassName()}
            onSubmit={(event) => {
              void form.handleSubmit((values) =>
                saveMutation.mutate(
                  toActivityLotteryDraftInput(values, currency)
                )
              )(event)
            }}
          >
            <SideDrawerSection>
              <SideDrawerSectionHeader title={t('Activity details')} />
              <FormField
                control={form.control}
                name='title'
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('Title')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        aria-invalid={fieldState.invalid}
                        placeholder={t('Enter activity title')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='description'
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('Description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        aria-invalid={fieldState.invalid}
                        rows={3}
                        placeholder={t('Explain the participation rules')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='startDateLocal'
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Participation start date (Beijing time)')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        aria-invalid={fieldState.invalid}
                        type='date'
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Successful wallet top-ups from this date at 00:00 until the draw time qualify, including top-ups completed before publication.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='drawAtLocal'
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('Draw time (Beijing time)')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        aria-invalid={fieldState.invalid}
                        type='datetime-local'
                        step={60}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'For October 7 at 24:00, enter October 8 at 00:00. The draw must be at least one day after the participation start date.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SideDrawerSection>

            <SideDrawerSection>
              <SideDrawerSectionHeader
                title={t('Prize tiers')}
                description={t(
                  'Amounts use the site currency ({{currency}}) and are converted to quota using the rate captured when published.',
                  { currency: currency.label }
                )}
              />
              {prizeFields.fields.map((item, index) => (
                <Card key={item.id} className='gap-4 p-4'>
                  <div className='flex items-center justify-between gap-2'>
                    <h4 className='font-medium'>
                      {t('Prize tier {{number}}', { number: index + 1 })}
                    </h4>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('Remove prize tier {{number}}', {
                        number: index + 1,
                      })}
                      disabled={prizeFields.fields.length === 1}
                      onClick={() => prizeFields.remove(index)}
                    >
                      <Trash2 aria-hidden='true' className='size-4' />
                    </Button>
                  </div>
                  <div className='grid gap-4 sm:grid-cols-3'>
                    <FormField
                      control={form.control}
                      name={`prizes.${index}.name`}
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>{t('Prize name')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              aria-invalid={fieldState.invalid}
                              placeholder={t('e.g. First prize')}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`prizes.${index}.count`}
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>{t('Winners')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              aria-invalid={fieldState.invalid}
                              type='number'
                              min={1}
                              max={1000}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`prizes.${index}.amountDisplay`}
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>
                            {t('Amount per winner ({{currency}})', {
                              currency: currency.label,
                            })}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              aria-invalid={fieldState.invalid}
                              inputMode='decimal'
                              placeholder={
                                currency.usesMinorUnits ? '500.00' : '500'
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Card>
              ))}
              <Button
                type='button'
                variant='outline'
                disabled={prizeFields.fields.length >= 10}
                onClick={() =>
                  prizeFields.append({
                    name: '',
                    count: '1',
                    amountDisplay: '',
                  })
                }
              >
                <Plus aria-hidden='true' className='size-4' />
                {t('Add prize tier')}
              </Button>
              {form.formState.errors.prizes?.message && (
                <p role='alert' className='text-destructive text-sm'>
                  {form.formState.errors.prizes.message}
                </p>
              )}
            </SideDrawerSection>

            <SideDrawerSection>
              <SideDrawerSectionHeader title={t('Draw policy')} />
              <FormField
                control={form.control}
                name='minParticipants'
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('Minimum qualified accounts')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        aria-invalid={fieldState.invalid}
                        type='number'
                        min={1}
                        max={1_000_000}
                        placeholder={t('Defaults to prize slots')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'If fewer accounts qualify, the round ends without issuing prizes.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Card className='grid gap-3 p-4 sm:grid-cols-2'>
                <div>
                  <p className='text-muted-foreground text-xs'>
                    {t('Prize slots')}
                  </p>
                  <p className='text-xl font-semibold tabular-nums'>
                    {formatNumber(slots, locale)}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground text-xs'>
                    {t('Total prize pool')}
                  </p>
                  <p className='text-xl font-semibold tabular-nums'>
                    {formatActivityPrizeAmount(poolAmount, currency, locale)}
                  </p>
                </div>
              </Card>
            </SideDrawerSection>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Cancel')}
          </SheetClose>
          <Button
            form='activity-lottery-draft-form'
            type='submit'
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? t('Saving...') : t('Save draft')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
