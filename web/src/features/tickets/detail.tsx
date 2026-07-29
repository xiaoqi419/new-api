import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ArrowLeft, Download, Send } from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Markdown } from '@/components/ui/markdown'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatTimestampToDate } from '@/lib/format'

import {
  adminGetTicketDetail,
  adminReplyTicket,
  adminUpdateTicketPriority,
  adminUpdateTicketStatus,
  closeTicket,
  downloadTicketAttachment,
  getTicketDetail,
  replyTicket,
} from './api'
import { TicketAttachmentsField } from './components/ticket-attachments-field'
import {
  TICKET_CATEGORY_LABEL_KEYS,
  TICKET_ERROR,
  TICKET_PRIORITY_LABEL_KEYS,
  TICKET_PRIORITY_VARIANTS,
  TICKET_STATUS_LABEL_KEYS,
  TICKET_STATUS_VARIANTS,
  TICKET_SUCCESS,
  getTicketPriorityOptions,
  getTicketStatusOptions,
} from './constants'
import type { TicketAttachment } from './types'

export function TicketDetailPage({
  id,
  admin,
}: {
  id: number
  admin: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [replyContent, setReplyContent] = useState('')
  const [replyAttachments, setReplyAttachments] = useState<TicketAttachment[]>(
    []
  )
  const [isReplying, setIsReplying] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const {
    data: ticket,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['ticket-detail', admin, id],
    queryFn: async () => {
      const res = admin
        ? await adminGetTicketDetail(id)
        : await getTicketDetail(id)
      if (!res.success) {
        toast.error(res.message || t(TICKET_ERROR.LOAD_FAILED))
        return null
      }
      return res.data ?? null
    },
  })

  const isClosed = ticket?.status === 'closed'
  const messages = ticket?.messages ?? []
  const statusOptions = getTicketStatusOptions(t)
  const priorityOptions = getTicketPriorityOptions(t)

  const handleBack = () => {
    if (admin) {
      navigate({ to: '/tickets/admin' })
    } else {
      navigate({ to: '/tickets' })
    }
  }

  const handleReply = async () => {
    if (!replyContent.trim() && replyAttachments.length === 0) return
    setIsReplying(true)
    try {
      const payload = { content: replyContent, attachments: replyAttachments }
      const res = admin
        ? await adminReplyTicket(id, payload)
        : await replyTicket(id, payload)
      if (res.success) {
        toast.success(t(TICKET_SUCCESS.REPLIED))
        setReplyContent('')
        setReplyAttachments([])
        void refetch()
      }
    } finally {
      setIsReplying(false)
    }
  }

  const handleClose = async () => {
    setIsClosing(true)
    try {
      const res = await closeTicket(id)
      if (res.success) {
        toast.success(t(TICKET_SUCCESS.CLOSED))
        void refetch()
      }
    } finally {
      setIsClosing(false)
    }
  }

  const handleStatusChange = async (status: string) => {
    const res = await adminUpdateTicketStatus(id, status)
    if (res.success) {
      toast.success(t(TICKET_SUCCESS.STATUS_UPDATED))
      void refetch()
    }
  }

  const handlePriorityChange = async (priority: string) => {
    const res = await adminUpdateTicketPriority(id, priority)
    if (res.success) {
      toast.success(t(TICKET_SUCCESS.PRIORITY_UPDATED))
      void refetch()
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {ticket ? ticket.title : t('Ticket Details')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' size='sm' onClick={handleBack}>
          <ArrowLeft className='h-4 w-4' />
          {t('Back')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-4xl flex-col gap-4'>
          {isLoading && (
            <>
              <Skeleton className='h-24 w-full rounded-xl' />
              <Skeleton className='h-40 w-full rounded-xl' />
            </>
          )}

          {!isLoading && !ticket && (
            <Empty className='min-h-64 border'>
              <EmptyHeader>
                <EmptyTitle>{t('Ticket not found')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {ticket && (
            <>
              <Card className='p-4'>
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusBadge
                    label={t(TICKET_STATUS_LABEL_KEYS[ticket.status])}
                    variant={TICKET_STATUS_VARIANTS[ticket.status]}
                    copyable={false}
                  />
                  <StatusBadge
                    label={t(TICKET_PRIORITY_LABEL_KEYS[ticket.priority])}
                    variant={TICKET_PRIORITY_VARIANTS[ticket.priority]}
                    copyable={false}
                  />
                  <StatusBadge
                    label={t(TICKET_CATEGORY_LABEL_KEYS[ticket.category])}
                    variant='neutral'
                    copyable={false}
                  />
                  {admin && (
                    <span className='text-muted-foreground text-sm'>
                      {t('User')}: {ticket.username}
                    </span>
                  )}
                  <span className='text-muted-foreground ml-auto font-mono text-xs'>
                    {ticket.ticket_no} ·{' '}
                    {formatTimestampToDate(ticket.created_at)}
                  </span>
                </div>

                {admin && (
                  <div className='mt-3 flex flex-wrap items-center gap-4'>
                    <div className='flex items-center gap-2'>
                      <span className='text-muted-foreground text-sm'>
                        {t('Status')}
                      </span>
                      <NativeSelect
                        value={ticket.status}
                        onChange={(e) =>
                          void handleStatusChange(e.target.value)
                        }
                      >
                        {statusOptions.map((o) => (
                          <NativeSelectOption key={o.value} value={o.value}>
                            {o.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className='flex items-center gap-2'>
                      <span className='text-muted-foreground text-sm'>
                        {t('Priority')}
                      </span>
                      <NativeSelect
                        value={ticket.priority}
                        onChange={(e) =>
                          void handlePriorityChange(e.target.value)
                        }
                      >
                        {priorityOptions.map((o) => (
                          <NativeSelectOption key={o.value} value={o.value}>
                            {o.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>
                )}
              </Card>

              <div className='flex flex-col gap-3'>
                {messages.map((msg) => (
                  <Card key={msg.id} className='p-4'>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium'>
                        {msg.author_name ||
                          (msg.author_role === 'admin'
                            ? t('Staff')
                            : t('User'))}
                      </span>
                      <StatusBadge
                        label={
                          msg.author_role === 'admin' ? t('Staff') : t('User')
                        }
                        variant={
                          msg.author_role === 'admin' ? 'info' : 'neutral'
                        }
                        copyable={false}
                      />
                      <span className='text-muted-foreground ml-auto text-xs'>
                        {formatTimestampToDate(msg.created_at)}
                      </span>
                    </div>
                    {msg.content && (
                      <div className='mt-2 text-sm'>
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    )}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className='mt-3 flex flex-wrap gap-2'>
                        {msg.attachments.map((att) => (
                          <Button
                            key={att.file}
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => {
                              void downloadTicketAttachment(
                                ticket.id,
                                att.file,
                                att.name
                              ).catch(() =>
                                toast.error(t(TICKET_ERROR.DOWNLOAD_FAILED))
                              )
                            }}
                          >
                            <Download className='h-3.5 w-3.5' />
                            {att.name}
                          </Button>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>

              {isClosed ? (
                <Card className='text-muted-foreground p-4 text-center text-sm'>
                  {t('This ticket is closed.')}
                </Card>
              ) : (
                <Card className='p-4'>
                  <Textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    rows={4}
                    placeholder={t('Write a reply...')}
                  />
                  <div className='mt-3'>
                    <TicketAttachmentsField
                      value={replyAttachments}
                      onChange={setReplyAttachments}
                      disabled={isReplying}
                    />
                  </div>
                  <div className='mt-3 flex justify-end gap-2'>
                    {!admin && (
                      <Button
                        type='button'
                        variant='outline'
                        disabled={isClosing}
                        onClick={() => void handleClose()}
                      >
                        {t('Close Ticket')}
                      </Button>
                    )}
                    <Button
                      type='button'
                      disabled={
                        isReplying ||
                        (!replyContent.trim() && replyAttachments.length === 0)
                      }
                      onClick={() => void handleReply()}
                    >
                      <Send className='h-4 w-4' />
                      {isReplying ? t('Sending...') : t('Send Reply')}
                    </Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
