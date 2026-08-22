import { zodResolver } from '@hookform/resolvers/zod'
import { type FormEvent, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/datetime-picker'
import {
  SideDrawerSection,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { createAnnouncement, updateAnnouncement } from '../api'
import {
  ANNOUNCEMENT_SUCCESS,
  getAnnouncementLevelOptions,
  getAnnouncementTypeOptions,
} from '../constants'
import {
  ANNOUNCEMENT_FORM_DEFAULT_VALUES,
  type AnnouncementFormValues,
  getAnnouncementFormSchema,
  transformAnnouncementToFormDefaults,
  transformFormDataToPayload,
} from '../lib/announcement-form'
import type { Announcement } from '../types'
import { useAnnouncements } from './announcements-provider'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Announcement
}

export function AnnouncementsMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: Props) {
  const { t } = useTranslation()
  const isUpdate = !!currentRow
  const { triggerRefresh } = useAnnouncements()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const typeOptions = getAnnouncementTypeOptions(t)
  const levelOptions = getAnnouncementLevelOptions(t)

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(getAnnouncementFormSchema(t)),
    defaultValues: ANNOUNCEMENT_FORM_DEFAULT_VALUES,
  })

  useEffect(() => {
    if (open && isUpdate && currentRow) {
      form.reset(transformAnnouncementToFormDefaults(currentRow))
    } else if (open && !isUpdate) {
      form.reset({
        ...ANNOUNCEMENT_FORM_DEFAULT_VALUES,
        publish_time: Math.floor(Date.now() / 1000),
      })
    }
  }, [open, isUpdate, currentRow, form])

  const onSubmit = async (data: AnnouncementFormValues) => {
    setIsSubmitting(true)
    try {
      const payload = transformFormDataToPayload(data)
      const result =
        isUpdate && currentRow
          ? await updateAnnouncement({ ...payload, id: currentRow.id })
          : await createAnnouncement(payload)
      if (result.success) {
        toast.success(
          t(isUpdate ? ANNOUNCEMENT_SUCCESS.UPDATED : ANNOUNCEMENT_SUCCESS.CREATED)
        )
        onOpenChange(false)
        triggerRefresh()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    void form.handleSubmit(onSubmit)(event)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) form.reset()
      }}
    >
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[600px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {isUpdate ? t('Edit Announcement') : t('Create Announcement')}
          </SheetTitle>
          <SheetDescription>
            {t('Announcements are shown on the announcements page.')}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='announcement-form'
            onSubmit={handleSubmit}
            className={sideDrawerFormClassName()}
          >
            <SideDrawerSection>
              <FormField
                control={form.control}
                name='title'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Title')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('Enter a title')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Category')}</FormLabel>
                    <FormControl>
                      <NativeSelect
                        className='w-full'
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      >
                        {typeOptions.map((o) => (
                          <NativeSelectOption key={o.value} value={o.value}>
                            {o.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='level'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Level')}</FormLabel>
                    <FormControl>
                      <NativeSelect
                        className='w-full'
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      >
                        {levelOptions.map((o) => (
                          <NativeSelectOption key={o.value} value={o.value}>
                            {o.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='version'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Version')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('e.g. 20260727 (release notes only)')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Shown in the version timeline for release notes.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='content'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Content')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={8}
                        placeholder={t('Supports Markdown')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='publish_time'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Publish Date')}</FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={
                          field.value ? new Date(field.value * 1000) : undefined
                        }
                        onChange={(date) =>
                          field.onChange(
                            date ? Math.floor(date.getTime() / 1000) : 0
                          )
                        }
                        placeholder={t('Select date')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='pinned'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between gap-3'>
                    <div>
                      <FormLabel>{t('Pinned')}</FormLabel>
                      <FormDescription>
                        {t('Show at the top of the list.')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='published'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between gap-3'>
                    <div>
                      <FormLabel>{t('Published')}</FormLabel>
                      <FormDescription>
                        {t('Unpublished announcements are hidden from users.')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </SideDrawerSection>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Close')}
          </SheetClose>
          <Button
            form='announcement-form'
            type='submit'
            disabled={isSubmitting}
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
