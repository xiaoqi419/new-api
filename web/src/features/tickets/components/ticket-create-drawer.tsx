import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { Textarea } from '@/components/ui/textarea'

import { createTicket } from '../api'
import {
  TICKET_SUCCESS,
  getTicketCategoryOptions,
  getTicketPriorityOptions,
} from '../constants'
import {
  TICKET_FORM_DEFAULT_VALUES,
  type TicketFormValues,
  getTicketFormSchema,
} from '../lib/ticket-form'
import type { TicketAttachment } from '../types'
import { TicketAttachmentsField } from './ticket-attachments-field'
import { useTickets } from './tickets-provider'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TicketCreateDrawer({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { triggerRefresh } = useTickets()
  const [attachments, setAttachments] = useState<TicketAttachment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const categoryOptions = getTicketCategoryOptions(t)
  const priorityOptions = getTicketPriorityOptions(t)

  const form = useForm<TicketFormValues>({
    resolver: zodResolver(getTicketFormSchema(t)),
    defaultValues: TICKET_FORM_DEFAULT_VALUES,
  })

  useEffect(() => {
    if (open) {
      form.reset(TICKET_FORM_DEFAULT_VALUES)
      setAttachments([])
    }
  }, [open, form])

  const onSubmit = async (data: TicketFormValues) => {
    setIsSubmitting(true)
    try {
      const res = await createTicket({ ...data, attachments })
      if (res.success && res.data) {
        toast.success(t(TICKET_SUCCESS.CREATED))
        onOpenChange(false)
        triggerRefresh()
        navigate({ to: '/tickets/detail', search: { id: res.data.id } })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    void form.handleSubmit(onSubmit)(event)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[600px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{t('Create Ticket')}</SheetTitle>
          <SheetDescription>
            {t('Describe your issue and our team will get back to you.')}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='ticket-form'
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
                      <Input
                        {...field}
                        placeholder={t('Briefly summarize your issue')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='category'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Category')}</FormLabel>
                    <FormControl>
                      <NativeSelect
                        className='w-full'
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      >
                        {categoryOptions.map((o) => (
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
                name='priority'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Priority')}</FormLabel>
                    <FormControl>
                      <NativeSelect
                        className='w-full'
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      >
                        {priorityOptions.map((o) => (
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
                name='content'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Content')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={8}
                        placeholder={t('Describe your issue in detail')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>{t('Attachments')}</FormLabel>
                <TicketAttachmentsField
                  value={attachments}
                  onChange={setAttachments}
                  disabled={isSubmitting}
                />
              </FormItem>
            </SideDrawerSection>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Close')}
          </SheetClose>
          <Button form='ticket-form' type='submit' disabled={isSubmitting}>
            {isSubmitting ? t('Submitting...') : t('Submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
