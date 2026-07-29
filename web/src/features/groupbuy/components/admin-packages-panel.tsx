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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Plus, RefreshCw } from '@/components/icons'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { deletePackage, listPackages } from '../admin-api'
import { durationUnitKey, formatShare, packageInfo } from '../lib'
import type { GroupBuyPackage, GroupBuyTier } from '../types'
import { AdminConfirmDialog } from './admin-confirm-dialog'
import { AdminPackageEditor } from './admin-package-editor'

function packageTiers(pkg: GroupBuyPackage): GroupBuyTier[] {
  if (pkg.tiers && pkg.tiers.length > 0) {
    return [...pkg.tiers].sort((a, b) => a.count - b.count)
  }
  if (pkg.required_count && pkg.total_amount) {
    return [
      {
        count: pkg.required_count,
        per_share_amount: Math.floor(pkg.total_amount / pkg.required_count),
      },
    ]
  }
  return []
}

export function AdminPackagesPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<GroupBuyPackage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GroupBuyPackage | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['gb-admin-packages'],
    queryFn: async () => {
      const res = await listPackages()
      return res.data ?? []
    },
  })
  const packages = data ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePackage(id),
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Package deleted'))
      void queryClient.invalidateQueries({ queryKey: ['gb-admin-packages'] })
      setDeleteTarget(null)
    },
  })

  const openCreate = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const openEdit = (pkg: GroupBuyPackage) => {
    setEditing(pkg)
    setEditorOpen(true)
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between gap-3'>
        <Button size='sm' onClick={openCreate}>
          <Plus className='mr-1 size-3.5' />
          {t('New Package')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['gb-admin-packages'] })
          }
          disabled={isFetching}
        >
          <RefreshCw
            className={`mr-2 size-3.5 ${isFetching ? 'animate-spin' : ''}`}
          />
          {t('Refresh')}
        </Button>
      </div>

      {isLoading && <Skeleton className='h-64 w-full rounded-xl' />}

      {!isLoading && packages.length === 0 && (
        <Empty className='min-h-64 border'>
          <EmptyHeader>
            <EmptyTitle>{t('No packages yet')}</EmptyTitle>
            <EmptyDescription>
              {t('Create your first group-buy package to get started.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!isLoading && packages.length > 0 && (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-16'>ID</TableHead>
                <TableHead>{t('Package Name')}</TableHead>
                <TableHead>{t('Price per person')}</TableHead>
                <TableHead>{t('Reward Tiers')}</TableHead>
                <TableHead>{t('Formation Window')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => {
                const info = packageInfo(pkg)
                const tiers = packageTiers(pkg)
                return (
                  <TableRow key={pkg.id}>
                    <TableCell className='text-muted-foreground'>
                      {pkg.id}
                    </TableCell>
                    <TableCell className='font-medium'>{pkg.name}</TableCell>
                    <TableCell>¥{info.price.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className='flex flex-wrap gap-1'>
                        {tiers.map((tier) => (
                          <span
                            key={`${pkg.id}-${tier.count}`}
                            className='bg-muted rounded-md px-2 py-0.5 text-xs'
                          >
                            {tier.count}
                            {t('people')} → {formatShare(tier.per_share_amount)}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {pkg.duration_value ?? '-'}{' '}
                      {t(durationUnitKey(pkg.duration_unit))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={pkg.enabled ? t('Enabled') : t('Disabled')}
                        variant={pkg.enabled ? 'success' : 'neutral'}
                        copyable={false}
                      />
                    </TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => openEdit(pkg)}
                        >
                          {t('Edit')}
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setDeleteTarget(pkg)}
                        >
                          {t('Delete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AdminPackageEditor
        open={editorOpen}
        pkg={editing}
        onOpenChange={setEditorOpen}
      />

      <AdminConfirmDialog
        open={deleteTarget !== null}
        title={t('Delete Package')}
        description={t(
          'Are you sure you want to delete this package? This cannot be undone.'
        )}
        confirmText={t('Delete')}
        destructive
        loading={deleteMutation.isPending}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />
    </div>
  )
}
