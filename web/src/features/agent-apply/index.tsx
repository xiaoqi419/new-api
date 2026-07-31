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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { getAgentApplyStatus, submitAgentApply } from './api'

const AGENT_STATUS_ACTIVE = 1
const AGENT_STATUS_DISABLED = 2

export function AgentApply() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['agent-apply-status'],
    queryFn: getAgentApplyStatus,
  })
  const status = data?.data
  const [name, setName] = useState('')
  const [prepay, setPrepay] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      submitAgentApply({ name, prepay_amount: Number(prepay) || 0 }),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Application submitted'))
      queryClient.invalidateQueries({ queryKey: ['agent-apply-status'] })
    },
  })

  const statusLabel = (s?: number) => {
    if (s === AGENT_STATUS_ACTIVE) return t('Active')
    if (s === AGENT_STATUS_DISABLED) return t('Disabled')
    return t('Pending')
  }

  const statusVariant = (s?: number): 'success' | 'danger' | 'warning' => {
    if (s === AGENT_STATUS_ACTIVE) return 'success'
    if (s === AGENT_STATUS_DISABLED) return 'danger'
    return 'warning'
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Become an Agent')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        {isLoading && (
          <p className='text-muted-foreground'>{t('Loading...')}</p>
        )}
        {!isLoading && status?.applied && (
          <div className='max-w-xl space-y-3'>
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground text-sm'>
                {t('Application Status')}:
              </span>
              <StatusBadge
                label={statusLabel(status.agent?.status)}
                variant={statusVariant(status.agent?.status)}
                copyable={false}
              />
            </div>
            {status.agent?.status === AGENT_STATUS_ACTIVE ? (
              <p className='text-sm'>
                {t('Your agent is active.')}{' '}
                <Link to='/agent-console' className='text-primary underline'>
                  {t('Go to Agent Console')}
                </Link>
              </p>
            ) : (
              <p className='text-muted-foreground text-sm'>
                {status.auto_approve
                  ? t(
                      'Your application is pending. It will be activated automatically once your prepayment is received.'
                    )
                  : t(
                      'Your application is pending admin review. You will be notified once approved.'
                    )}
              </p>
            )}
          </div>
        )}
        {!isLoading && !status?.applied && (
          <div className='max-w-xl space-y-4'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Apply to become an agent (white-label reseller). After approval you can bind your own domain, brand the site, set group ratios, configure your own payment gateways, and manage your terminal users.'
              )}
            </p>
            <div className='space-y-1'>
              <Label>{t('Agent Name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('e.g. My AI Store')}
              />
            </div>
            <div className='space-y-1'>
              <Label>{t('Desired Prepay Amount')}</Label>
              <Input
                type='number'
                value={prepay}
                onChange={(e) => setPrepay(e.target.value)}
              />
            </div>
            <p className='text-muted-foreground text-xs'>
              {status?.auto_approve
                ? t(
                    'Auto-approval is enabled: your agent activates automatically after prepayment.'
                  )
                : t(
                    'Applications are reviewed manually by the platform administrator.'
                  )}
            </p>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {t('Submit Application')}
            </Button>
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
