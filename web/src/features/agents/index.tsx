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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatQuota, formatTimestamp } from '@/lib/format'

import {
  type Agent,
  type AgentLedger,
  adjustAgentWallet,
  approveAgent,
  createAgent,
  disableAgent,
  getAgentLedgers,
  getAgents,
  updateAgent,
} from './api'

const AGENT_STATUS_PENDING = 0
const AGENT_STATUS_ACTIVE = 1
const AGENT_STATUS_DISABLED = 2

function useAgentStatusMeta() {
  const { t } = useTranslation()
  return (status: number) => {
    switch (status) {
      case AGENT_STATUS_ACTIVE:
        return { label: t('Active'), variant: 'success' as const }
      case AGENT_STATUS_DISABLED:
        return { label: t('Disabled'), variant: 'danger' as const }
      default:
        return { label: t('Pending'), variant: 'warning' as const }
    }
  }
}

export function AgentsAdmin() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const statusMeta = useAgentStatusMeta()

  const [createOpen, setCreateOpen] = useState(false)
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const [walletAgent, setWalletAgent] = useState<Agent | null>(null)
  const [ledgersAgent, setLedgersAgent] = useState<Agent | null>(null)
  const [confirmAgent, setConfirmAgent] = useState<{
    agent: Agent
    action: 'approve' | 'disable'
  } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => getAgents(1, 50),
  })
  const agents = data?.data?.items ?? []

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['agents'] })

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!confirmAgent) return
      return confirmAgent.action === 'approve'
        ? approveAgent(confirmAgent.agent.id)
        : disableAgent(confirmAgent.agent.id)
    },
    onSuccess: (res) => {
      if (res && !res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Operation completed'))
      setConfirmAgent(null)
      invalidate()
    },
  })

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Agent Management')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button onClick={() => setCreateOpen(true)}>
            {t('Create Agent')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('ID')}</TableHead>
                  <TableHead>{t('Name')}</TableHead>
                  <TableHead>{t('Owner User ID')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Wallet Balance')}</TableHead>
                  <TableHead>{t('Settlement Discount')}</TableHead>
                  <TableHead>{t('Created At')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className='text-center'>
                      {t('Loading...')}
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && agents.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className='text-muted-foreground text-center'
                    >
                      {t('No data')}
                    </TableCell>
                  </TableRow>
                )}
                {agents.map((agent) => {
                  const meta = statusMeta(agent.status)
                  return (
                    <TableRow key={agent.id}>
                      <TableCell>{agent.id}</TableCell>
                      <TableCell className='font-medium'>
                        {agent.name}
                      </TableCell>
                      <TableCell>{agent.owner_user_id}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={meta.label}
                          variant={meta.variant}
                          copyable={false}
                        />
                      </TableCell>
                      <TableCell>{formatQuota(agent.wallet_quota)}</TableCell>
                      <TableCell>{agent.cost_ratio}</TableCell>
                      <TableCell className='text-muted-foreground text-sm'>
                        {agent.created_time
                          ? formatTimestamp(agent.created_time)
                          : '-'}
                      </TableCell>
                      <TableCell className='space-x-1 text-right'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setEditAgent(agent)}
                        >
                          {t('Edit')}
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setWalletAgent(agent)}
                        >
                          {t('Wallet')}
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setLedgersAgent(agent)}
                        >
                          {t('Ledgers')}
                        </Button>
                        {agent.status !== AGENT_STATUS_ACTIVE && (
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              setConfirmAgent({ agent, action: 'approve' })
                            }
                          >
                            {t('Approve')}
                          </Button>
                        )}
                        {agent.status !== AGENT_STATUS_DISABLED && (
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              setConfirmAgent({ agent, action: 'disable' })
                            }
                          >
                            {t('Disable')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <AgentMutateDialog
        mode='create'
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={invalidate}
      />
      <AgentMutateDialog
        mode='edit'
        agent={editAgent}
        open={!!editAgent}
        onOpenChange={(v) => !v && setEditAgent(null)}
        onSaved={invalidate}
      />
      <AgentWalletDialog
        agent={walletAgent}
        open={!!walletAgent}
        onOpenChange={(v) => !v && setWalletAgent(null)}
        onSaved={invalidate}
      />
      <AgentLedgersDialog
        agent={ledgersAgent}
        open={!!ledgersAgent}
        onOpenChange={(v) => !v && setLedgersAgent(null)}
      />
      <ConfirmDialog
        open={!!confirmAgent}
        onOpenChange={(v) => !v && setConfirmAgent(null)}
        destructive={confirmAgent?.action === 'disable'}
        title={
          confirmAgent?.action === 'approve'
            ? t('Approve Agent?')
            : t('Disable Agent?')
        }
        desc={confirmAgent?.agent.name ?? ''}
        isLoading={confirmMutation.isPending}
        handleConfirm={() => confirmMutation.mutate()}
        confirmText={t('Confirm')}
      />
    </>
  )
}

function AgentMutateDialog({
  mode,
  agent,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: 'create' | 'edit'
  agent?: Agent | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [ownerUserId, setOwnerUserId] = useState('')
  const [costRatio, setCostRatio] = useState('1')
  const [status, setStatus] = useState(String(AGENT_STATUS_ACTIVE))
  const [remark, setRemark] = useState('')
  const [initialized, setInitialized] = useState(false)

  if (open && !initialized) {
    setInitialized(true)
    setName(agent?.name ?? '')
    setOwnerUserId(agent ? String(agent.owner_user_id) : '')
    setCostRatio(agent ? String(agent.cost_ratio) : '1')
    setStatus(String(agent?.status ?? AGENT_STATUS_ACTIVE))
    setRemark(agent?.remark ?? '')
  }
  if (!open && initialized) {
    setInitialized(false)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return createAgent({
          owner_user_id: Number(ownerUserId) || 0,
          name,
          cost_ratio: Number(costRatio) || 1,
          status: Number(status),
          remark,
        })
      }
      if (!agent) throw new Error('missing agent')
      return updateAgent({
        id: agent.id,
        name,
        cost_ratio: Number(costRatio),
        status: Number(status),
        remark,
      })
    },
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Saved'))
      onOpenChange(false)
      onSaved()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('Create Agent') : t('Edit Agent')}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label>{t('Name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {mode === 'create' && (
            <div className='space-y-1'>
              <Label>{t('Owner User ID')}</Label>
              <Input
                type='number'
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
              />
              <p className='text-muted-foreground text-xs'>
                {t('The platform user to be upgraded to this agent owner.')}
              </p>
            </div>
          )}
          <div className='space-y-1'>
            <Label>{t('Settlement Discount')}</Label>
            <Input
              type='number'
              step='0.01'
              value={costRatio}
              onChange={(e) => setCostRatio(e.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'For every $M a terminal user tops up, the platform deducts M x discount from the agent wallet.'
              )}
            </p>
          </div>
          <div className='space-y-1'>
            <Label>{t('Status')}</Label>
            <NativeSelect
              className='w-full'
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <NativeSelectOption value={String(AGENT_STATUS_ACTIVE)}>
                {t('Active')}
              </NativeSelectOption>
              <NativeSelectOption value={String(AGENT_STATUS_PENDING)}>
                {t('Pending')}
              </NativeSelectOption>
              <NativeSelectOption value={String(AGENT_STATUS_DISABLED)}>
                {t('Disabled')}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div className='space-y-1'>
            <Label>{t('Remark')}</Label>
            <Input value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name}
          >
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AgentWalletDialog({
  agent,
  open,
  onOpenChange,
  onSaved,
}: {
  agent: Agent | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [delta, setDelta] = useState('')
  const [type, setType] = useState('prepay')
  const [remark, setRemark] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      if (!agent) throw new Error('missing agent')
      return adjustAgentWallet(agent.id, {
        delta: Number(delta) || 0,
        type,
        remark,
      })
    },
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Wallet updated'))
      setDelta('')
      setRemark('')
      onOpenChange(false)
      onSaved()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {t('Adjust Wallet')}
            {agent ? ` - ${agent.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          {agent && (
            <p className='text-muted-foreground text-sm'>
              {t('Current balance')}: {formatQuota(agent.wallet_quota)}
            </p>
          )}
          <div className='space-y-1'>
            <Label>{t('Quota Delta')}</Label>
            <Input
              type='number'
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t('Positive to top up, negative to deduct (quota units).')}
            </p>
          </div>
          <div className='space-y-1'>
            <Label>{t('Type')}</Label>
            <NativeSelect
              className='w-full'
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <NativeSelectOption value='prepay'>
                {t('Prepay')}
              </NativeSelectOption>
              <NativeSelectOption value='adjust'>
                {t('Adjust')}
              </NativeSelectOption>
              <NativeSelectOption value='refund'>
                {t('Refund')}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div className='space-y-1'>
            <Label>{t('Remark')}</Label>
            <Input value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !delta}
          >
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AgentLedgersDialog({
  agent,
  open,
  onOpenChange,
}: {
  agent: Agent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['agent-ledgers', agent?.id],
    queryFn: () => {
      if (!agent) throw new Error('missing agent')
      return getAgentLedgers(agent.id, 1, 50)
    },
    enabled: !!agent && open,
  })
  const ledgers: AgentLedger[] = data?.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {t('Wallet Ledgers')}
            {agent ? ` - ${agent.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className='max-h-[60vh] overflow-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Type')}</TableHead>
                <TableHead>{t('Quota Delta')}</TableHead>
                <TableHead>{t('Balance After')}</TableHead>
                <TableHead>{t('Remark')}</TableHead>
                <TableHead>{t('Time')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className='text-center'>
                    {t('Loading...')}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && ledgers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className='text-muted-foreground text-center'
                  >
                    {t('No data')}
                  </TableCell>
                </TableRow>
              )}
              {ledgers.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.type}</TableCell>
                  <TableCell>{l.quota_delta}</TableCell>
                  <TableCell>{formatQuota(l.balance_after)}</TableCell>
                  <TableCell className='max-w-[220px] truncate'>
                    {l.content}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-sm'>
                    {l.created_time ? formatTimestamp(l.created_time) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
