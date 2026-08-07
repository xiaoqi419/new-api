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
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { useSystemOptions, getOptionValue } from '../hooks/use-system-options'
import { useUpdateOption } from '../hooks/use-update-option'

interface FeatureToggleCardProps {
  /** Boolean option key, e.g. GroupBuyEnabled. */
  optionKey: string
  label: string
  description: string
}

/**
 * Master switch for a feature whose admin screen lives outside system settings,
 * so the option is reachable from the page where it is configured. Hidden from
 * non-root admins because /api/option/ is root-only.
 */
export function FeatureToggleCard(props: FeatureToggleCardProps) {
  const isRoot = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  if (!isRoot) return null
  return <RootFeatureToggleCard {...props} />
}

function RootFeatureToggleCard({
  optionKey,
  label,
  description,
}: FeatureToggleCardProps) {
  const { data, isLoading } = useSystemOptions()
  const updateOption = useUpdateOption()

  const enabled = getOptionValue(data?.data, { [optionKey]: false })[optionKey]

  return (
    <Card>
      <CardContent className='flex items-center justify-between gap-4 py-4'>
        <div className='space-y-1'>
          <Label htmlFor={optionKey}>{label}</Label>
          <p className='text-muted-foreground text-sm'>{description}</p>
        </div>
        {isLoading ? (
          <Skeleton className='h-[18.4px] w-[32px] rounded-full' />
        ) : (
          <Switch
            id={optionKey}
            checked={enabled}
            disabled={updateOption.isPending}
            onCheckedChange={(checked) =>
              updateOption.mutate({ key: optionKey, value: checked })
            }
          />
        )}
      </CardContent>
    </Card>
  )
}
