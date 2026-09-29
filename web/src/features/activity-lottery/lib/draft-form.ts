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
*/
import type { TFunction } from 'i18next'
import { z } from 'zod'

import type {
  ActivityLotteryCampaign,
  ActivityLotteryDraftInput,
} from '../types'
import {
  activityLotteryCurrencyFromCampaign,
  formatActivityPrizeLimit,
  getCurrentActivityLotteryCurrency,
  parseActivityPrizeAmount,
  type ActivityLotteryCurrency,
} from './money'
import {
  formatShanghaiInputTime,
  formatShanghaiStartDate,
  parseShanghaiInputTime,
  parseShanghaiStartDate,
} from './time'

export function getActivityLotteryDraftSchema(
  t: TFunction,
  currency: ActivityLotteryCurrency = getCurrentActivityLotteryCurrency(),
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  const todayLocalDate = formatShanghaiInputTime(nowSeconds).slice(0, 10)
  const shanghaiDayStart = parseShanghaiStartDate(todayLocalDate)

  return z
    .object({
      title: z
        .string()
        .trim()
        .min(1, t('Title is required'))
        .max(128, t('Title is too long')),
      description: z.string().trim().max(1000, t('Description is too long')),
      startDateLocal: z.string().refine((value) => {
        const startAt = parseShanghaiStartDate(value)
        return (
          startAt !== null &&
          shanghaiDayStart !== null &&
          startAt <= shanghaiDayStart
        )
      }, t('Participation start date cannot be in the future')),
      drawAtLocal: z.string().refine((value) => {
        const drawAt = parseShanghaiInputTime(value)
        return drawAt !== null
      }, t('Enter a valid Beijing draw time')),
      minParticipants: z
        .string()
        .refine(
          (value) =>
            value === '' ||
            (/^[1-9]\d{0,6}$/.test(value) && Number(value) <= 1_000_000),
          t('Enter a valid minimum participant count')
        ),
      prizes: z
        .array(
          z.object({
            name: z
              .string()
              .trim()
              .min(1, t('Prize name is required'))
              .max(64, t('Prize name is too long')),
            count: z
              .string()
              .refine(
                (value) =>
                  /^[1-9]\d{0,3}$/.test(value) && Number(value) <= 1000,
                t('Enter 1 to 1000 winners')
              ),
            amountDisplay: z.string().refine(
              (value) => parseActivityPrizeAmount(value, currency) !== null,
              t('Enter an amount from {{minimum}} to {{maximum}}', {
                minimum: formatActivityPrizeLimit(currency.minAmount, currency),
                maximum: formatActivityPrizeLimit(currency.maxAmount, currency),
              })
            ),
          })
        )
        .min(1, t('Add at least one prize tier'))
        .max(10, t('Up to 10 prize tiers are allowed')),
    })
    .superRefine((values, context) => {
      const startAt = parseShanghaiStartDate(values.startDateLocal)
      const drawAt = parseShanghaiInputTime(values.drawAtLocal)
      if (drawAt !== null && drawAt <= nowSeconds) {
        context.addIssue({
          code: 'custom',
          path: ['drawAtLocal'],
          message: t('Draw time must be in the future'),
        })
      }
      if (startAt !== null && drawAt !== null && drawAt < startAt + 86400) {
        context.addIssue({
          code: 'custom',
          path: ['drawAtLocal'],
          message: t(
            'Draw time must be at least one day after the participation start date'
          ),
        })
      }
      const slots = values.prizes.reduce(
        (total, prize) => total + Number(prize.count || 0),
        0
      )
      const poolAmount = values.prizes.reduce(
        (total, prize) =>
          total +
          Number(prize.count || 0) *
            (parseActivityPrizeAmount(prize.amountDisplay, currency) ?? 0),
        0
      )
      if (slots > 1000) {
        context.addIssue({
          code: 'custom',
          path: ['prizes'],
          message: t('Total prize slots cannot exceed 1000'),
        })
      }
      if (poolAmount > 100_000_000) {
        context.addIssue({
          code: 'custom',
          path: ['prizes'],
          message: t('Prize pool cannot exceed {{maximum}}', {
            maximum: formatActivityPrizeLimit(100_000_000, currency),
          }),
        })
      }
      if (values.minParticipants && Number(values.minParticipants) < slots) {
        context.addIssue({
          code: 'custom',
          path: ['minParticipants'],
          message: t('Minimum participants must cover every prize slot'),
        })
      }
    })
}

export type ActivityLotteryDraftFormValues = z.infer<
  ReturnType<typeof getActivityLotteryDraftSchema>
>

export function getActivityLotteryDraftDefaults(
  campaign?: ActivityLotteryCampaign,
  configuredCurrency = getCurrentActivityLotteryCurrency()
): ActivityLotteryDraftFormValues {
  const currency = campaign
    ? activityLotteryCurrencyFromCampaign(campaign)
    : configuredCurrency
  if (!campaign) {
    return {
      title: '',
      description: '',
      startDateLocal: formatShanghaiStartDate(Math.floor(Date.now() / 1000)),
      drawAtLocal: '',
      minParticipants: '',
      prizes: [{ name: '', count: '1', amountDisplay: '' }],
    }
  }

  return {
    title: campaign.title,
    description: campaign.description,
    startDateLocal:
      campaign.qualification_start_at > 0
        ? formatShanghaiStartDate(campaign.qualification_start_at)
        : formatShanghaiStartDate(Math.floor(Date.now() / 1000)),
    drawAtLocal: formatShanghaiInputTime(campaign.draw_at),
    minParticipants: String(campaign.min_participants),
    prizes: campaign.prizes.map((prize) => ({
      name: prize.name,
      count: String(prize.count),
      amountDisplay: currency.usesMinorUnits
        ? (prize.amount_cents / 100).toFixed(2)
        : String(prize.amount_cents),
    })),
  }
}

export function toActivityLotteryDraftInput(
  values: ActivityLotteryDraftFormValues,
  currency = getCurrentActivityLotteryCurrency()
): ActivityLotteryDraftInput {
  const drawAt = parseShanghaiInputTime(values.drawAtLocal)
  const qualificationStartAt = parseShanghaiStartDate(values.startDateLocal)
  if (drawAt === null) {
    throw new RangeError('Invalid activity lottery draw time')
  }
  if (qualificationStartAt === null) {
    throw new RangeError('Invalid activity lottery participation start date')
  }

  return {
    title: values.title.trim(),
    description: values.description.trim(),
    qualification_start_at: qualificationStartAt,
    draw_at: drawAt,
    min_participants: values.minParticipants
      ? Number(values.minParticipants)
      : 0,
    prizes: values.prizes.map((prize) => {
      const amountMinor = parseActivityPrizeAmount(
        prize.amountDisplay,
        currency
      )
      if (amountMinor === null) {
        throw new RangeError('Invalid activity lottery prize amount')
      }
      return {
        name: prize.name.trim(),
        count: Number(prize.count),
        amount_cents: amountMinor,
      }
    }),
  }
}
