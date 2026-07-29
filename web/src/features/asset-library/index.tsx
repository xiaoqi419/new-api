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

import { Copy, Loader2, Trash2 } from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { formatTimestampToDate } from '@/lib/format'

import { createAsset, deleteAsset, listAssets } from './api'
import { ASSET_POLL_INTERVAL_MS } from './constants'
import { assetStatusMeta, isTerminalAssetStatus } from './lib'

export function AssetLibrary() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['ark-assets'],
    queryFn: async () => {
      const res = await listAssets()
      return res.data ?? []
    },
    refetchInterval: (query) => {
      const items = query.state.data ?? []
      return items.some((a) => !isTerminalAssetStatus(a.status))
        ? ASSET_POLL_INTERVAL_MS
        : false
    },
  })
  const assets = data ?? []

  const createMutation = useMutation({
    mutationFn: () => createAsset(name.trim(), url.trim()),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Failed to add asset'))
        return
      }
      toast.success(t('Submitted, processing'))
      setName('')
      setUrl('')
      void queryClient.invalidateQueries({ queryKey: ['ark-assets'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Failed to delete'))
        return
      }
      toast.success(t('Deleted'))
      void queryClient.invalidateQueries({ queryKey: ['ark-assets'] })
    },
  })

  const handleAdd = () => {
    const trimmed = url.trim()
    if (!/^https?:\/\//.test(trimmed)) {
      toast.error(t('Please enter a public image URL (http/https)'))
      return
    }
    createMutation.mutate()
  }

  const handleCopy = async (assetId: string) => {
    const ref = `asset://${assetId}`
    if (await copyToClipboard(ref)) {
      toast.success(`${t('Copied reference')}: ${ref}`)
    } else {
      toast.error(ref)
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Asset Library')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-4'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Register public face/portrait image URLs to your private asset library. Once ready, reference them in video generation via asset://. Only publicly accessible image URLs are supported.'
            )}
          </p>

          <Card>
            <CardHeader>
              <CardTitle>{t('Add Asset')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='flex flex-col gap-3 sm:flex-row'>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('Name (optional)')}
                  className='sm:w-56'
                />
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t('Public image URL (http/https)')}
                  className='flex-1'
                />
                <Button onClick={handleAdd} disabled={createMutation.isPending}>
                  {createMutation.isPending && (
                    <Loader2 className='mr-2 size-4 animate-spin' />
                  )}
                  {t('Add')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {isLoading && <Skeleton className='h-64 w-full rounded-xl' />}

          {!isLoading && assets.length === 0 && (
            <Empty className='min-h-64 border'>
              <EmptyHeader>
                <EmptyTitle>{t('No assets yet')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {!isLoading && assets.length > 0 && (
            <div className='rounded-xl border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-20'>{t('Preview')}</TableHead>
                    <TableHead>{t('Name')}</TableHead>
                    <TableHead>{t('Type')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead>{t('Reference ID')}</TableHead>
                    <TableHead>{t('Created At')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => {
                    const meta = assetStatusMeta(asset.status)
                    return (
                      <TableRow key={asset.id}>
                        <TableCell>
                          {asset.url ? (
                            <img
                              src={asset.url}
                              alt=''
                              className='size-11 rounded-md object-cover'
                              onError={(e) => {
                                e.currentTarget.style.visibility = 'hidden'
                              }}
                            />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className='font-medium'>
                          {asset.name || '-'}
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          {asset.asset_type}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={t(meta.key)}
                            variant={meta.variant}
                            copyable={false}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='font-mono text-xs'
                            onClick={() => handleCopy(asset.asset_id)}
                          >
                            <Copy className='mr-1 size-3' />
                            asset://{asset.asset_id}
                          </Button>
                        </TableCell>
                        <TableCell className='text-muted-foreground text-xs'>
                          {asset.created_time
                            ? formatTimestampToDate(asset.created_time)
                            : '-'}
                        </TableCell>
                        <TableCell className='text-right'>
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  className='text-destructive'
                                >
                                  <Trash2 className='size-3.5' />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t('Delete this asset?')}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {asset.name || asset.asset_id}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {t('Cancel')}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  variant='destructive'
                                  onClick={() =>
                                    deleteMutation.mutate(asset.asset_id)
                                  }
                                >
                                  {t('Delete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
