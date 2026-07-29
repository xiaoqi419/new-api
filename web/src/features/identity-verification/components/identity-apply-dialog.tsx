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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Loader2, Upload } from '@/components/icons'
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

import { getIdentityTypes, submitIdentityVerification } from '../api'
import { IDENTITY_PROOF_ACCEPT, MAX_IDENTITY_PROOF_BYTES } from '../constants'

interface IdentityApplyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function IdentityApplyDialog({
  open,
  onOpenChange,
}: IdentityApplyDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [typeKey, setTypeKey] = useState('')
  const [realName, setRealName] = useState('')
  const [org, setOrg] = useState('')
  const [extra, setExtra] = useState('')
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (!open) return
    setTypeKey('')
    setRealName('')
    setOrg('')
    setExtra('')
    setFile(null)
  }, [open])

  const { data, isLoading } = useQuery({
    queryKey: ['identity-types'],
    queryFn: async () => (await getIdentityTypes()).data,
    enabled: open,
  })
  const enabled = data?.enabled ?? false
  const types = data?.types ?? []
  const selectedType = types.find((item) => item.key === typeKey)

  const mutation = useMutation({
    mutationFn: submitIdentityVerification,
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Verification request submitted'))
      void queryClient.invalidateQueries({
        queryKey: ['identity-verification-self'],
      })
      onOpenChange(false)
    },
  })

  const pickFile = (selected: File | null) => {
    if (!selected) {
      setFile(null)
      return
    }
    if (selected.size > MAX_IDENTITY_PROOF_BYTES) {
      toast.error(t('File size cannot exceed 10MB'))
      return
    }
    setFile(selected)
  }

  const submit = () => {
    if (!typeKey) {
      toast.error(t('Please select an identity type'))
      return
    }
    if (!realName.trim()) {
      toast.error(t('Real name is required'))
      return
    }
    if (!file) {
      toast.error(t('Please upload a proof file'))
      return
    }
    mutation.mutate({
      type_key: typeKey,
      real_name: realName.trim(),
      org: org.trim(),
      extra: extra.trim(),
      file,
    })
  }

  const typeItems = types.map((item) => ({ value: item.key, label: item.name }))

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Apply for Verification')}
      contentClassName='sm:max-w-md'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={mutation.isPending || !enabled || types.length === 0}
          >
            {mutation.isPending && (
              <Loader2 className='mr-2 size-4 animate-spin' />
            )}
            {t('Submit')}
          </Button>
        </>
      }
    >
      {isLoading && (
        <div className='flex justify-center py-6'>
          <Loader2 className='text-primary size-5 animate-spin' />
        </div>
      )}

      {!isLoading && (!enabled || types.length === 0) && (
        <p className='text-muted-foreground py-4 text-center text-sm'>
          {t('Identity verification is currently unavailable.')}
        </p>
      )}

      {!isLoading && enabled && types.length > 0 && (
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label>{t('Identity Type')}</Label>
            <Select
              items={typeItems}
              value={typeKey}
              onValueChange={(v) => v && setTypeKey(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('Select an identity type')}>
                  {selectedType?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {typeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className='flex flex-col gap-2'>
            <Label htmlFor='iv-real-name'>{t('Real Name')}</Label>
            <Input
              id='iv-real-name'
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder={t('Enter your real name')}
            />
          </div>

          <div className='flex flex-col gap-2'>
            <Label htmlFor='iv-org'>{t('Organization')}</Label>
            <Input
              id='iv-org'
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder={t('School / hospital / institution (optional)')}
            />
          </div>

          <div className='flex flex-col gap-2'>
            <Label htmlFor='iv-extra'>{t('Additional Info')}</Label>
            <Input
              id='iv-extra'
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder={t('Student ID / staff number (optional)')}
            />
          </div>

          <div className='flex flex-col gap-2'>
            <Label>{t('Proof Material')}</Label>
            <p className='text-muted-foreground text-xs'>
              {t('Upload a photo or PDF of your credential (up to 10MB).')}
            </p>
            <input
              ref={inputRef}
              type='file'
              accept={IDENTITY_PROOF_ACCEPT}
              className='hidden'
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                onClick={() => inputRef.current?.click()}
              >
                <Upload className='mr-2 size-4' />
                {t('Choose File')}
              </Button>
              <span className='text-muted-foreground min-w-0 flex-1 truncate text-sm'>
                {file ? file.name : t('No file selected')}
              </span>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
