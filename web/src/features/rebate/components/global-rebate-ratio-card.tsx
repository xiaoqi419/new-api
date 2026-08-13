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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useSystemOptions,
  getOptionValue,
} from '@/features/system-settings/hooks/use-system-options'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { formatRebateRatio } from '../lib'

const OPTION_KEY = 'RebateRatio'

/**
 * Editor for the global default rebate ratio. Every inviter without an
 * exclusive ratio falls back to this value, and it defaults to 0 — so without
 * this control the feature can be switched on while silently rebating nothing.
 * Hidden from non-root admins because /api/option/ is root-only.
 */
export function GlobalRebateRatioCard() {
  const isRoot = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  if (!isRoot) return null
  return <RootGlobalRebateRatioCard />
}

function RootGlobalRebateRatioCard() {
  const { t } = useTranslation()
  const { data, isLoading } = useSystemOptions()
  const updateOption = useUpdateOption()

  const savedRatio = getOptionValue(data?.data, { [OPTION_KEY]: 0 })[OPTION_KEY]
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setDraft(String(savedRatio))
  }, [savedRatio])

  const parsed = Number(draft.trim())
  const isValid =
    draft.trim() !== '' && !Number.isNaN(parsed) && parsed >= 0 && parsed <= 1
  const isDirty = draft.trim() !== String(savedRatio)

  const save = () => {
    if (!isValid) {
      toast.error(t('Enter a ratio between 0 and 1'))
      return
    }
    updateOption.mutate({ key: OPTION_KEY, value: draft.trim() })
  }

  return (
    <Card>
      <CardContent className='flex flex-col gap-3 py-4 sm:flex-row sm:items-end sm:justify-between'>
        <div className='space-y-1'>
          <Label htmlFor='global-rebate-ratio'>
            {t('Global Default Rebate Ratio')}
          </Label>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Used for every inviter without an exclusive ratio below. Range 0 to 1, e.g. 0.1 means 10% of the top-up amount. Leave it at 0 and no rebate is generated.'
            )}
          </p>
        </div>
        {isLoading ? (
          <Skeleton className='h-9 w-48' />
        ) : (
          <div className='flex items-center gap-2'>
            <Input
              id='global-rebate-ratio'
              type='number'
              min={0}
              max={1}
              step={0.01}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className='w-28'
            />
            <span className='text-muted-foreground w-20 text-sm tabular-nums'>
              {isValid ? formatRebateRatio(parsed) : '—'}
            </span>
            <Button
              size='sm'
              onClick={save}
              disabled={!isDirty || updateOption.isPending}
            >
              {updateOption.isPending && (
                <Loader2 className='mr-2 size-4 animate-spin' />
              )}
              {t('Save')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
