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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { updateSystemOption } from '@/features/system-settings/api'
import {
  getOptionValue,
  useSystemOptions,
} from '@/features/system-settings/hooks/use-system-options'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

const OPTION_KEY = 'TopUpBonusCampaign'

interface BonusTier {
  id: string
  pay: string
  gift: string
}

interface BonusDraft {
  enabled: boolean
  start: string
  end: string
  tiers: BonusTier[]
}

function localInput(unix: number) {
  if (!unix) return ''
  const date = new Date(unix * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function unixFromInput(value: string) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  if (!Number.isFinite(parsed)) return 0
  return Math.floor(parsed / 1000)
}

function blankTier(id: string): BonusTier {
  return { id, pay: '', gift: '' }
}

let addedTierCount = 0

function draftFrom(raw: string): BonusDraft {
  const empty: BonusDraft = {
    enabled: false,
    start: '',
    end: '',
    tiers: [blankTier('tier-0')],
  }
  try {
    const parsed = JSON.parse(raw) as {
      enabled?: boolean
      start?: number
      end?: number
      tiers?: Array<{ pay?: number; gift?: number }>
    }
    const tiers = Array.isArray(parsed.tiers)
      ? parsed.tiers.map((tier, index) => ({
          id: `tier-${index}`,
          pay: tier.pay ? String(tier.pay) : '',
          gift: tier.gift ? String(tier.gift) : '',
        }))
      : []
    return {
      enabled: parsed.enabled === true,
      start: localInput(parsed.start || 0),
      end: localInput(parsed.end || 0),
      tiers: tiers.length > 0 ? tiers : empty.tiers,
    }
  } catch {
    return empty
  }
}

export function TopUpBonusSettings() {
  const isRoot = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  if (!isRoot) return null
  return <RootTopUpBonusSettings />
}

function RootTopUpBonusSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const options = useSystemOptions()
  const stored = getOptionValue(options.data?.data, {
    [OPTION_KEY]: '{"enabled":false,"start":0,"end":0,"tiers":[]}',
  })[OPTION_KEY]
  const [draft, setDraft] = useState<BonusDraft | null>(null)
  // Keep unsaved edits when the options query refetches. A null draft follows the server.
  const visible = draft ?? draftFrom(stored)

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        enabled: visible.enabled,
        start: unixFromInput(visible.start),
        end: unixFromInput(visible.end),
        tiers: visible.tiers
          .map((tier) => ({ pay: Number(tier.pay), gift: Number(tier.gift) }))
          .filter((tier) => tier.pay > 0 || tier.gift > 0),
      }
      requireServerSuccess(
        await updateSystemOption({ key: OPTION_KEY, value: JSON.stringify(payload) })
      )
    },
    onSuccess: async () => {
      setDraft(null)
      toast.success(t('Setting updated successfully'))
      await queryClient.invalidateQueries({ queryKey: ['system-options'] })
      await queryClient.invalidateQueries({ queryKey: ['topup-info'] })
    },
    onError: (error: Error) => {
      handleServerError(error, t('Failed to update setting'))
    },
  })

  const update = (next: BonusDraft) => {
    setDraft(next)
  }

  return (
    <Card>
      <CardContent className='py-4'>
        <FieldGroup>
          <Field orientation='horizontal'>
            <FieldLabel htmlFor='topup-bonus-enabled'>
              {t('Enable recharge bonus')}
            </FieldLabel>
            <Switch
              id='topup-bonus-enabled'
              checked={visible.enabled}
              disabled={save.isPending || options.isLoading}
              onCheckedChange={(checked) =>
                update({ ...visible, enabled: checked })
              }
            />
          </Field>
          <FieldDescription>
            {t(
              'While this is on, a successful wallet top-up automatically receives the highest matching gift.'
            )}
          </FieldDescription>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='topup-bonus-start'>{t('Starts')}</FieldLabel>
              <Input
                id='topup-bonus-start'
                type='datetime-local'
                value={visible.start}
                disabled={save.isPending}
                onChange={(event) =>
                  update({ ...visible, start: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='topup-bonus-end'>{t('Ends')}</FieldLabel>
              <Input
                id='topup-bonus-end'
                type='datetime-local'
                value={visible.end}
                disabled={save.isPending}
                onChange={(event) =>
                  update({ ...visible, end: event.target.value })
                }
              />
            </Field>
          </div>
          {visible.tiers.map((tier, index) => (
            <div key={tier.id} className='grid gap-2 sm:grid-cols-[1fr_1fr_auto]'>
              <Field>
                <FieldLabel htmlFor={`topup-bonus-pay-${index}`}>
                  {t('Pay amount (CNY)')}
                </FieldLabel>
                <Input
                  id={`topup-bonus-pay-${index}`}
                  inputMode='decimal'
                  value={tier.pay}
                  disabled={save.isPending}
                  onChange={(event) => {
                    const tiers = visible.tiers.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, pay: event.target.value }
                        : item
                    )
                    update({ ...visible, tiers })
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`topup-bonus-gift-${index}`}>
                  {t('Gift amount (CNY)')}
                </FieldLabel>
                <Input
                  id={`topup-bonus-gift-${index}`}
                  inputMode='decimal'
                  value={tier.gift}
                  disabled={save.isPending}
                  onChange={(event) => {
                    const tiers = visible.tiers.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, gift: event.target.value }
                        : item
                    )
                    update({ ...visible, tiers })
                  }}
                />
              </Field>
              <Button
                type='button'
                variant='outline'
                className='sm:mt-6'
                disabled={save.isPending || visible.tiers.length === 1}
                onClick={() =>
                  update({
                    ...visible,
                    tiers: visible.tiers.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
              >
                {t('Remove')}
              </Button>
            </div>
          ))}
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={save.isPending || visible.tiers.length >= 20}
              onClick={() =>
                update({
                  ...visible,
                  tiers: [...visible.tiers, blankTier(`tier-added-${++addedTierCount}`)],
                })
              }
            >
              {t('Add tier')}
            </Button>
            <Button
              type='button'
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {t('Save recharge bonus')}
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
