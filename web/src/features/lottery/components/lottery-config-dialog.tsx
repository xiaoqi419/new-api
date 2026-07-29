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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CurrencyQuotaField } from '@/components/currency-quota-field'
import { Dialog } from '@/components/dialog'
import { Loader2, Plus, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { parseQuotaFromDollars, quotaUnitsToInput } from '@/lib/format'

import { getLotteryConfig, saveLotteryConfig } from '../api'
import type {
  ConsumeGrantRule,
  LotteryPrize,
  PrizeType,
  TopupGrantRule,
} from '../types'

interface LotteryConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface EditablePrize extends Omit<LotteryPrize, 'quota'> {
  uid: string
  quota: string
}

interface EditableRule extends Omit<ConsumeGrantRule, 'threshold'> {
  uid: string
  threshold: string
}

interface EditableTopupRule extends Omit<TopupGrantRule, 'threshold'> {
  uid: string
  threshold: string
}

let uidCounter = 0
const nextUid = () => `lottery-${uidCounter++}`

export function LotteryConfigDialog({
  open,
  onOpenChange,
}: LotteryConfigDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [enabled, setEnabled] = useState(false)
  const [baseQuota, setBaseQuota] = useState('')
  const [prizes, setPrizes] = useState<EditablePrize[]>([])
  const [rules, setRules] = useState<EditableRule[]>([])
  const [topupRules, setTopupRules] = useState<EditableTopupRule[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['lottery-config'],
    queryFn: async () => (await getLotteryConfig()).data,
    enabled: open,
  })

  useEffect(() => {
    if (!open || !data) return
    setEnabled(data.enabled ?? false)
    setBaseQuota(quotaUnitsToInput(data.base_quota ?? 0))
    setPrizes(
      (data.prizes ?? []).map((p) => ({
        ...p,
        quota: quotaUnitsToInput(p.quota),
        uid: nextUid(),
      }))
    )
    setRules(
      (data.grant_rules ?? []).map((r) => ({
        ...r,
        threshold: quotaUnitsToInput(r.threshold),
        uid: nextUid(),
      }))
    )
    setTopupRules(
      (data.topup_grant_rules ?? []).map((r) => ({
        ...r,
        threshold: quotaUnitsToInput(r.threshold),
        uid: nextUid(),
      }))
    )
  }, [open, data])

  const mutation = useMutation({
    mutationFn: saveLotteryConfig,
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Configuration saved'))
      void queryClient.invalidateQueries({ queryKey: ['lottery-config'] })
      void queryClient.invalidateQueries({ queryKey: ['lottery-status'] })
      onOpenChange(false)
    },
  })

  const updatePrize = (uid: string, patch: Partial<EditablePrize>) =>
    setPrizes((prev) =>
      prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p))
    )

  const addPrize = () =>
    setPrizes((prev) => [
      ...prev,
      {
        key: '',
        name: '',
        type: 'quota',
        quota: '',
        weight: 1,
        color: '',
        enabled: true,
        uid: nextUid(),
      },
    ])

  const removePrize = (uid: string) =>
    setPrizes((prev) => prev.filter((p) => p.uid !== uid))

  const updateRule = (uid: string, patch: Partial<EditableRule>) =>
    setRules((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r))
    )

  const addRule = () =>
    setRules((prev) => [
      ...prev,
      { threshold: '', cards_per: 1, enabled: true, uid: nextUid() },
    ])

  const removeRule = (uid: string) =>
    setRules((prev) => prev.filter((r) => r.uid !== uid))

  const updateTopupRule = (uid: string, patch: Partial<EditableTopupRule>) =>
    setTopupRules((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r))
    )

  const addTopupRule = () =>
    setTopupRules((prev) => [
      ...prev,
      {
        threshold: '',
        cards_per: 1,
        card_expire_days: 0,
        enabled: true,
        uid: nextUid(),
      },
    ])

  const removeTopupRule = (uid: string) =>
    setTopupRules((prev) => prev.filter((r) => r.uid !== uid))

  const submit = () => {
    for (const p of prizes) {
      if (!p.key.trim() || !p.name.trim()) {
        toast.error(t('Prize key and name are required'))
        return
      }
    }
    const keys = prizes.map((p) => p.key.trim())
    if (new Set(keys).size !== keys.length) {
      toast.error(t('Prize keys must be unique'))
      return
    }
    mutation.mutate({
      enabled,
      base_quota: parseQuotaFromDollars(Number(baseQuota) || 0),
      prizes: prizes.map((p) => ({
        key: p.key.trim(),
        name: p.name.trim(),
        type: p.type,
        quota: parseQuotaFromDollars(Number(p.quota) || 0),
        weight: Number(p.weight) || 0,
        color: p.color.trim(),
        enabled: p.enabled,
      })),
      grant_rules: rules.map((r) => ({
        threshold: parseQuotaFromDollars(Number(r.threshold) || 0),
        cards_per: Number(r.cards_per) || 0,
        enabled: r.enabled,
      })),
      topup_grant_rules: topupRules.map((r) => ({
        threshold: parseQuotaFromDollars(Number(r.threshold) || 0),
        cards_per: Number(r.cards_per) || 0,
        card_expire_days: Number(r.card_expire_days) || 0,
        enabled: r.enabled,
      })),
    })
  }

  const typeOptions: { value: PrizeType; label: string }[] = [
    { value: 'quota', label: t('Quota') },
    { value: 'redraw', label: t('Free spin') },
    { value: 'empty', label: t('No prize') },
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Lottery Settings')}
      contentClassName='sm:max-w-4xl'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && (
              <Loader2 className='mr-2 size-4 animate-spin' />
            )}
            {t('Save')}
          </Button>
        </>
      }
    >
      {isLoading && (
        <div className='flex justify-center py-6'>
          <Loader2 className='text-primary size-5 animate-spin' />
        </div>
      )}

      {!isLoading && (
        <div className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center gap-4'>
            <div className='flex items-center gap-2'>
              <Checkbox
                id='lottery-enabled'
                checked={enabled}
                onCheckedChange={(c) => setEnabled(c === true)}
              />
              <Label htmlFor='lottery-enabled'>{t('Enable lucky draw')}</Label>
            </div>
            <CurrencyQuotaField
              id='lottery-base'
              label={t('Guaranteed quota per draw')}
              value={baseQuota}
              onChange={setBaseQuota}
              className='w-64'
            />
          </div>

          <div className='flex items-center justify-between'>
            <Label>{t('Prizes')}</Label>
            <Button variant='outline' size='sm' onClick={addPrize}>
              <Plus className='mr-1 size-3.5' />
              {t('Add Prize')}
            </Button>
          </div>

          <p className='text-muted-foreground text-xs'>
            {t(
              'Amounts are entered in the display currency and converted to quota automatically. Weight sets the win probability; higher weight means higher chance.'
            )}
          </p>

          {prizes.length === 0 && (
            <p className='text-muted-foreground py-4 text-center text-sm'>
              {t('No prizes configured yet')}
            </p>
          )}

          {prizes.map((p) => (
            <div
              key={p.uid}
              className='grid grid-cols-2 items-start gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_0.8fr_0.8fr_auto_auto]'
            >
              <div className='flex flex-col gap-1'>
                <Label className='text-xs'>{t('Prize Key')}</Label>
                <Input
                  value={p.key}
                  onChange={(e) => updatePrize(p.uid, { key: e.target.value })}
                  placeholder='q30'
                />
              </div>
              <div className='flex flex-col gap-1'>
                <Label className='text-xs'>{t('Display Name')}</Label>
                <Input
                  value={p.name}
                  onChange={(e) => updatePrize(p.uid, { name: e.target.value })}
                />
              </div>
              <div className='flex flex-col gap-1'>
                <Label className='text-xs'>{t('Type')}</Label>
                <NativeSelect
                  value={p.type}
                  onChange={(e) =>
                    updatePrize(p.uid, { type: e.target.value as PrizeType })
                  }
                >
                  {typeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <CurrencyQuotaField
                label={t('Quota')}
                value={p.quota}
                onChange={(v) => updatePrize(p.uid, { quota: v })}
              />
              <div className='flex flex-col gap-1'>
                <Label className='text-xs'>{t('Weight')}</Label>
                <Input
                  type='number'
                  min={0}
                  value={p.weight}
                  onChange={(e) =>
                    updatePrize(p.uid, { weight: Number(e.target.value) })
                  }
                />
              </div>
              <div className='flex flex-col gap-1'>
                <Label aria-hidden className='invisible text-xs'>
                  .
                </Label>
                <div className='flex h-8 items-center gap-2'>
                  <Checkbox
                    checked={p.enabled}
                    onCheckedChange={(c) =>
                      updatePrize(p.uid, { enabled: c === true })
                    }
                  />
                  <span className='text-muted-foreground text-xs'>
                    {t('Open')}
                  </span>
                </div>
              </div>
              <div className='flex flex-col gap-1'>
                <Label aria-hidden className='invisible text-xs'>
                  .
                </Label>
                <Button
                  variant='ghost'
                  size='icon'
                  className='text-destructive'
                  onClick={() => removePrize(p.uid)}
                  aria-label={t('Remove')}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            </div>
          ))}

          <div className='mt-2 flex items-center justify-between'>
            <Label>{t('Consumption Grant Rules')}</Label>
            <Button variant='outline' size='sm' onClick={addRule}>
              <Plus className='mr-1 size-3.5' />
              {t('Add Rule')}
            </Button>
          </div>

          <p className='text-muted-foreground text-xs'>
            {t(
              'When a user reaches the cumulative spend threshold, grant them the given number of lottery cards (each threshold grants once).'
            )}
          </p>

          {rules.length === 0 && (
            <p className='text-muted-foreground py-4 text-center text-sm'>
              {t('No grant rules configured yet')}
            </p>
          )}

          {rules.map((r) => (
            <div
              key={r.uid}
              className='grid grid-cols-2 items-start gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto_auto]'
            >
              <CurrencyQuotaField
                label={t('Cumulative Spend')}
                value={r.threshold}
                onChange={(v) => updateRule(r.uid, { threshold: v })}
              />
              <div className='flex flex-col gap-1'>
                <Label className='text-xs'>{t('Cards Granted')}</Label>
                <Input
                  type='number'
                  min={0}
                  value={r.cards_per}
                  onChange={(e) =>
                    updateRule(r.uid, { cards_per: Number(e.target.value) })
                  }
                />
              </div>
              <div className='flex flex-col gap-1'>
                <Label aria-hidden className='invisible text-xs'>
                  .
                </Label>
                <div className='flex h-8 items-center gap-2'>
                  <Checkbox
                    checked={r.enabled}
                    onCheckedChange={(c) =>
                      updateRule(r.uid, { enabled: c === true })
                    }
                  />
                  <span className='text-muted-foreground text-xs'>
                    {t('Open')}
                  </span>
                </div>
              </div>
              <div className='flex flex-col gap-1'>
                <Label aria-hidden className='invisible text-xs'>
                  .
                </Label>
                <Button
                  variant='ghost'
                  size='icon'
                  className='text-destructive'
                  onClick={() => removeRule(r.uid)}
                  aria-label={t('Remove')}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            </div>
          ))}

          <div className='mt-2 flex items-center justify-between'>
            <Label>{t('Topup Grant Rules')}</Label>
            <Button variant='outline' size='sm' onClick={addTopupRule}>
              <Plus className='mr-1 size-3.5' />
              {t('Add Rule')}
            </Button>
          </div>

          <p className='text-muted-foreground text-xs'>
            {t(
              'When a user reaches the cumulative topup threshold, grant them the given number of lottery cards. Set an expiry (days) for limited-time cards, or 0 to never expire.'
            )}
          </p>

          {topupRules.length === 0 && (
            <p className='text-muted-foreground py-4 text-center text-sm'>
              {t('No grant rules configured yet')}
            </p>
          )}

          {topupRules.map((r) => (
            <div
              key={r.uid}
              className='grid grid-cols-2 items-start gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]'
            >
              <CurrencyQuotaField
                label={t('Cumulative Topup')}
                value={r.threshold}
                onChange={(v) => updateTopupRule(r.uid, { threshold: v })}
              />
              <div className='flex flex-col gap-1'>
                <Label className='text-xs'>{t('Cards Granted')}</Label>
                <Input
                  type='number'
                  min={0}
                  value={r.cards_per}
                  onChange={(e) =>
                    updateTopupRule(r.uid, {
                      cards_per: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className='flex flex-col gap-1'>
                <Label className='text-xs'>{t('Card Expiry (days)')}</Label>
                <Input
                  type='number'
                  min={0}
                  value={r.card_expire_days}
                  onChange={(e) =>
                    updateTopupRule(r.uid, {
                      card_expire_days: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className='flex flex-col gap-1'>
                <Label aria-hidden className='invisible text-xs'>
                  .
                </Label>
                <div className='flex h-8 items-center gap-2'>
                  <Checkbox
                    checked={r.enabled}
                    onCheckedChange={(c) =>
                      updateTopupRule(r.uid, { enabled: c === true })
                    }
                  />
                  <span className='text-muted-foreground text-xs'>
                    {t('Open')}
                  </span>
                </div>
              </div>
              <div className='flex flex-col gap-1'>
                <Label aria-hidden className='invisible text-xs'>
                  .
                </Label>
                <Button
                  variant='ghost'
                  size='icon'
                  className='text-destructive'
                  onClick={() => removeTopupRule(r.uid)}
                  aria-label={t('Remove')}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
