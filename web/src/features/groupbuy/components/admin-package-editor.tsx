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
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
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

import {
  createPackage,
  listSubscriptionPlans,
  updatePackage,
} from '../admin-api'
import { DEFAULT_NEW_TIERS, DURATION_UNITS } from '../constants'
import { durationUnitKey, formatShare } from '../lib'
import type { GroupBuyPackage } from '../types'

interface TierRow {
  _k: string
  count: number
  per_share_amount: number
}

let tierKeySeq = 0
const makeTierRow = (count: number, perShareAmount: number): TierRow => ({
  _k: `tier-${(tierKeySeq += 1)}`,
  count,
  per_share_amount: perShareAmount,
})

function toTierRows(pkg: GroupBuyPackage | null): TierRow[] {
  if (pkg?.tiers && pkg.tiers.length > 0) {
    return pkg.tiers.map((x) => makeTierRow(x.count, x.per_share_amount))
  }
  if (pkg?.required_count && pkg.total_amount) {
    return [
      makeTierRow(
        pkg.required_count,
        Math.floor(pkg.total_amount / pkg.required_count)
      ),
    ]
  }
  return DEFAULT_NEW_TIERS.map((x) => makeTierRow(x.count, x.per_share_amount))
}

interface AdminPackageEditorProps {
  open: boolean
  pkg: GroupBuyPackage | null
  onOpenChange: (open: boolean) => void
}

export function AdminPackageEditor({
  open,
  pkg,
  onOpenChange,
}: AdminPackageEditorProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editId = pkg?.id

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [perSharePrice, setPerSharePrice] = useState(10)
  const [durationUnit, setDurationUnit] = useState('day')
  const [durationValue, setDurationValue] = useState(1)
  const [enabled, setEnabled] = useState(true)
  const [tiers, setTiers] = useState<TierRow[]>([])
  const [rewardPlanId, setRewardPlanId] = useState(0)

  const { data: planData } = useQuery({
    queryKey: ['gb-subscription-plans'],
    queryFn: async () => (await listSubscriptionPlans()).data ?? [],
    enabled: open,
  })
  const plans = planData ?? []

  useEffect(() => {
    if (!open) return
    setName(pkg?.name ?? '')
    setDescription(pkg?.description ?? '')
    setPerSharePrice(
      Number(pkg?.per_share_price) ||
        (pkg?.required_count && pkg?.total_price
          ? Number((pkg.total_price / pkg.required_count).toFixed(2))
          : 10)
    )
    setDurationUnit(pkg?.duration_unit || 'day')
    setDurationValue(pkg?.duration_value || 1)
    setEnabled(pkg?.enabled ?? true)
    setTiers(toTierRows(pkg ?? null))
    setRewardPlanId(pkg?.reward_subscription_plan_id ?? 0)
  }, [open, pkg])

  const mutation = useMutation({
    mutationFn: (payload: {
      name: string
      description: string
      per_share_price: number
      tiers: { count: number; per_share_amount: number }[]
      duration_unit: string
      duration_value: number
      enabled: boolean
      reward_subscription_plan_id: number
    }) =>
      editId
        ? updatePackage({ ...payload, id: editId })
        : createPackage(payload),
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(editId ? t('Package updated') : t('Package created'))
      void queryClient.invalidateQueries({ queryKey: ['gb-admin-packages'] })
      onOpenChange(false)
    },
  })

  const updateTier = (
    key: string,
    field: 'count' | 'per_share_amount',
    value: number
  ) =>
    setTiers((prev) =>
      prev.map((row) => (row._k === key ? { ...row, [field]: value } : row))
    )

  const addTier = () =>
    setTiers((prev) => {
      const last = prev.at(-1)
      return [
        ...prev,
        makeTierRow((last?.count ?? 2) + 1, last?.per_share_amount ?? 100),
      ]
    })

  const removeTier = (key: string) =>
    setTiers((prev) => prev.filter((row) => row._k !== key))

  const submit = () => {
    const cleanTiers = tiers
      .map((x) => ({
        count: Number(x.count),
        per_share_amount: Number(x.per_share_amount),
      }))
      .filter((x) => x.count >= 2 && x.per_share_amount > 0)
      .sort((a, b) => a.count - b.count)

    if (!name.trim()) {
      toast.error(t('Package name is required'))
      return
    }
    if (perSharePrice <= 0) {
      toast.error(t('Price per person must be greater than 0'))
      return
    }
    if (durationValue <= 0) {
      toast.error(t('Formation window must be greater than 0'))
      return
    }
    if (cleanTiers.length === 0) {
      toast.error(
        t('Configure at least one valid tier (members >= 2, credit > 0)')
      )
      return
    }

    mutation.mutate({
      name: name.trim(),
      description: description.trim(),
      per_share_price: perSharePrice,
      tiers: cleanTiers,
      duration_unit: durationUnit,
      duration_value: durationValue,
      enabled,
      reward_subscription_plan_id: rewardPlanId,
    })
  }

  const unitItems = DURATION_UNITS.map((u) => ({
    value: u,
    label: t(durationUnitKey(u)),
  }))

  const planItems = [
    { value: '0', label: t('Wallet quota (default)') },
    ...plans.map((p) => {
      const grp = p.scope_group || p.upgrade_group
      return {
        value: String(p.id),
        label: grp ? `${p.title} · ${grp}` : p.title,
      }
    }),
  ]
  const selectedPlanLabel =
    planItems.find((o) => o.value === String(rewardPlanId))?.label ??
    t('Wallet quota (default)')

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editId ? t('Edit Package') : t('New Package')}
      contentClassName='sm:max-w-xl'
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
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='gb-pkg-name'>{t('Package Name')}</Label>
          <Input
            id='gb-pkg-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('Package Name')}
          />
        </div>

        <div className='flex flex-col gap-2'>
          <Label htmlFor='gb-pkg-desc'>{t('Description')}</Label>
          <Textarea
            id='gb-pkg-desc'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div className='flex flex-col gap-2'>
          <Label htmlFor='gb-pkg-price'>
            {t('Price per person (CNY, fixed)')}
          </Label>
          <Input
            id='gb-pkg-price'
            type='number'
            min={0.01}
            step={1}
            value={perSharePrice}
            onChange={(e) => setPerSharePrice(Number(e.target.value))}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Every member pays the same price; the more members, the higher each member is credited.'
            )}
          </p>
        </div>

        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between'>
            <Label>{t('Reward Tiers')}</Label>
            <Button variant='outline' size='sm' onClick={addTier}>
              <Plus className='mr-1 size-3.5' />
              {t('Add Tier')}
            </Button>
          </div>
          <p className='text-muted-foreground text-xs'>
            {t(
              'When the member count reaches a tier, every member is credited at that tier; settlement uses the highest tier reached before expiry.'
            )}
          </p>
          <div className='flex flex-col gap-2'>
            {tiers.map((row) => (
              <div key={row._k} className='flex items-center gap-2'>
                <div className='flex items-center gap-1'>
                  <span className='text-muted-foreground text-xs'>
                    {t('Members')}
                  </span>
                  <Input
                    type='number'
                    min={2}
                    step={1}
                    className='w-20'
                    value={row.count}
                    onChange={(e) =>
                      updateTier(row._k, 'count', Number(e.target.value))
                    }
                  />
                </div>
                <div className='flex items-center gap-1'>
                  <span className='text-muted-foreground text-xs'>
                    {t('Credit each')}
                  </span>
                  <Input
                    type='number'
                    min={1}
                    step={1}
                    className='w-24'
                    value={row.per_share_amount}
                    onChange={(e) =>
                      updateTier(
                        row._k,
                        'per_share_amount',
                        Number(e.target.value)
                      )
                    }
                  />
                </div>
                <span className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
                  ≈ {formatShare(row.per_share_amount)}
                </span>
                <Button
                  variant='ghost'
                  size='icon'
                  disabled={tiers.length <= 1}
                  onClick={() => removeTier(row._k)}
                  aria-label={t('Remove')}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className='flex flex-col gap-2'>
          <Label>{t('Reward delivery')}</Label>
          <Select
            items={planItems}
            value={String(rewardPlanId)}
            onValueChange={(v) => v != null && setRewardPlanId(Number(v))}
          >
            <SelectTrigger className='w-full'>
              <SelectValue>{selectedPlanLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {planItems.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Bind a subscription plan to confine the reward to that group; the subscription balance equals the unlocked tier credit. Wallet quota is the classic shared balance.'
            )}
          </p>
        </div>

        <div className='flex flex-wrap items-end gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='gb-pkg-duration'>{t('Formation Window')}</Label>
            <Input
              id='gb-pkg-duration'
              type='number'
              min={1}
              step={1}
              className='w-28'
              value={durationValue}
              onChange={(e) => setDurationValue(Number(e.target.value))}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label>{t('Unit')}</Label>
            <Select
              items={unitItems}
              value={durationUnit}
              onValueChange={(v) => v && setDurationUnit(v)}
            >
              <SelectTrigger className='w-32'>
                <SelectValue>{t(durationUnitKey(durationUnit))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {unitItems.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className='flex items-center gap-2 pb-2'>
            <Switch
              id='gb-pkg-enabled'
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor='gb-pkg-enabled'>{t('Enabled')}</Label>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
