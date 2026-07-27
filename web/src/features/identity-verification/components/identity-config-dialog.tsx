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

import { CurrencyQuotaField } from '@/components/currency-quota-field'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseQuotaFromDollars, quotaUnitsToInput } from '@/lib/format'

import { getIdentityConfig, saveIdentityConfig } from '../api'
import type { IdentityType } from '../types'

interface IdentityConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface EditableType extends Omit<IdentityType, 'quota'> {
  uid: string
  quota: string
}

let uidCounter = 0
const nextUid = () => `iv-type-${uidCounter++}`

export function IdentityConfigDialog({
  open,
  onOpenChange,
}: IdentityConfigDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [enabled, setEnabled] = useState(false)
  const [types, setTypes] = useState<EditableType[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['identity-config'],
    queryFn: async () => (await getIdentityConfig()).data,
    enabled: open,
  })

  useEffect(() => {
    if (!open || !data) return
    setEnabled(data.enabled ?? false)
    setTypes(
      (data.types ?? []).map((item) => ({
        ...item,
        quota: quotaUnitsToInput(item.quota),
        uid: nextUid(),
      }))
    )
  }, [open, data])

  const mutation = useMutation({
    mutationFn: saveIdentityConfig,
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Configuration saved'))
      void queryClient.invalidateQueries({ queryKey: ['identity-config'] })
      void queryClient.invalidateQueries({ queryKey: ['identity-types'] })
      onOpenChange(false)
    },
  })

  const updateType = (uid: string, patch: Partial<EditableType>) =>
    setTypes((prev) =>
      prev.map((item) => (item.uid === uid ? { ...item, ...patch } : item))
    )

  const addType = () =>
    setTypes((prev) => [
      ...prev,
      { key: '', name: '', quota: '', enabled: true, uid: nextUid() },
    ])

  const removeType = (uid: string) =>
    setTypes((prev) => prev.filter((item) => item.uid !== uid))

  const submit = () => {
    for (const item of types) {
      if (!item.key.trim() || !item.name.trim()) {
        toast.error(t('Type key and name are required'))
        return
      }
    }
    const keys = types.map((item) => item.key.trim())
    if (new Set(keys).size !== keys.length) {
      toast.error(t('Type keys must be unique'))
      return
    }
    mutation.mutate({
      enabled,
      types: types.map((item) => ({
        key: item.key.trim(),
        name: item.name.trim(),
        quota: parseQuotaFromDollars(Number(item.quota) || 0),
        enabled: item.enabled,
      })),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Identity Verification Settings')}
      contentClassName='sm:max-w-3xl'
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
          <div className='flex items-center gap-2'>
            <Checkbox
              id='iv-enabled'
              checked={enabled}
              onCheckedChange={(c) => setEnabled(c === true)}
            />
            <Label htmlFor='iv-enabled'>
              {t('Enable identity verification')}
            </Label>
          </div>

          <div className='flex items-center justify-between'>
            <Label>{t('Identity Types')}</Label>
            <Button variant='outline' size='sm' onClick={addType}>
              <Plus className='mr-1 size-3.5' />
              {t('Add Type')}
            </Button>
          </div>

          <p className='text-muted-foreground text-xs'>
            {t(
              'Quota is granted automatically on approval. Enter the amount in the display currency; it converts to quota automatically.'
            )}
          </p>

          {types.length === 0 && (
            <p className='text-muted-foreground py-4 text-center text-sm'>
              {t('No identity types configured yet.')}
            </p>
          )}

          {types.map((item) => (
            <div
              key={item.uid}
              className='grid grid-cols-1 items-start gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]'
            >
              <div className='flex flex-col gap-1'>
                <Label className='text-xs'>{t('Type Key')}</Label>
                <Input
                  value={item.key}
                  onChange={(e) =>
                    updateType(item.uid, { key: e.target.value })
                  }
                  placeholder='teacher'
                />
              </div>
              <div className='flex flex-col gap-1'>
                <Label className='text-xs'>{t('Display Name')}</Label>
                <Input
                  value={item.name}
                  onChange={(e) =>
                    updateType(item.uid, { name: e.target.value })
                  }
                  placeholder={t('Teacher')}
                />
              </div>
              <CurrencyQuotaField
                label={t('Quota')}
                value={item.quota}
                onChange={(v) => updateType(item.uid, { quota: v })}
              />
              <div className='flex flex-col gap-1'>
                <Label aria-hidden className='invisible text-xs'>
                  .
                </Label>
                <div className='flex h-8 items-center gap-2'>
                  <Checkbox
                    checked={item.enabled}
                    onCheckedChange={(c) =>
                      updateType(item.uid, { enabled: c === true })
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
                  onClick={() => removeType(item.uid)}
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
