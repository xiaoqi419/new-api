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

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatQuota, formatTimestamp } from '@/lib/format'

import {
  type AgentDomain,
  type AgentLedger,
  type AgentPaymentConfigView,
  type AgentTerminalUser,
  addAgentDomain,
  deleteAgentDomain,
  getAgentConsoleLedgers,
  getAgentConsoleUsers,
  getAgentPaymentConfigs,
  getAgentSelf,
  listAgentDomains,
  updateAgentOptions,
  updateAgentPayment,
  updateAgentRatios,
  verifyAgentDomain,
} from './api'
import { PrepayCard } from './components/prepay-card'

const BRAND_FIELDS: { key: string; labelKey: string; multiline: boolean }[] = [
  { key: 'SystemName', labelKey: 'Site Name', multiline: false },
  { key: 'Logo', labelKey: 'Logo URL', multiline: false },
  { key: 'Footer', labelKey: 'Footer HTML', multiline: true },
  { key: 'HomePageContent', labelKey: 'Home Page Content', multiline: true },
  { key: 'About', labelKey: 'About', multiline: true },
  { key: 'Notice', labelKey: 'Notice', multiline: true },
]

export function AgentConsole() {
  const { t } = useTranslation()
  const { data: selfRes, isLoading } = useQuery({
    queryKey: ['agent-console-self'],
    queryFn: getAgentSelf,
  })
  const self = selfRes?.data

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Agent Console')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        {isLoading && (
          <p className='text-muted-foreground'>{t('Loading...')}</p>
        )}
        {!isLoading && !self && (
          <p className='text-muted-foreground'>
            {t('You are not an agent, or your agent is not active.')}
          </p>
        )}
        {self && (
          <Tabs defaultValue='brand' className='space-y-4'>
            <TabsList>
              <TabsTrigger value='brand'>{t('Brand')}</TabsTrigger>
              <TabsTrigger value='domains'>{t('Domains')}</TabsTrigger>
              <TabsTrigger value='ratios'>{t('Group Ratios')}</TabsTrigger>
              <TabsTrigger value='payment'>{t('Payment')}</TabsTrigger>
              <TabsTrigger value='wallet'>{t('Wallet')}</TabsTrigger>
              <TabsTrigger value='users'>{t('Terminal Users')}</TabsTrigger>
            </TabsList>
            <TabsContent value='brand'>
              <BrandTab options={self.options} />
            </TabsContent>
            <TabsContent value='domains'>
              <DomainsTab />
            </TabsContent>
            <TabsContent value='ratios'>
              <RatiosTab sellGroupRatios={self.sell_group_ratios} />
            </TabsContent>
            <TabsContent value='payment'>
              <PaymentTab />
            </TabsContent>
            <TabsContent value='wallet'>
              <WalletTab
                walletQuota={self.wallet_quota}
                costRatio={self.cost_ratio}
              />
            </TabsContent>
            <TabsContent value='users'>
              <UsersTab />
            </TabsContent>
          </Tabs>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function BrandTab({ options }: { options: Record<string, string> }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of BRAND_FIELDS) init[f.key] = options[f.key] ?? ''
    return init
  })

  const mutation = useMutation({
    mutationFn: () => updateAgentOptions(values),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Saved'))
      queryClient.invalidateQueries({ queryKey: ['agent-console-self'] })
    },
  })

  return (
    <div className='max-w-2xl space-y-4'>
      {BRAND_FIELDS.map((f) => (
        <div key={f.key} className='space-y-1'>
          <Label>{t(f.labelKey)}</Label>
          {f.multiline ? (
            <Textarea
              rows={3}
              value={values[f.key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
            />
          ) : (
            <Input
              value={values[f.key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
            />
          )}
        </div>
      ))}
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {t('Save')}
      </Button>
    </div>
  )
}

function DomainsTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [newDomain, setNewDomain] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['agent-console-domains'],
    queryFn: listAgentDomains,
  })
  const domains: AgentDomain[] = data?.data?.domains ?? []
  const verifyTxt = data?.data?.verify_txt ?? '_newapi-verify'

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['agent-console-domains'] })

  const addMutation = useMutation({
    mutationFn: () => addAgentDomain(newDomain),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Domain added'))
      setNewDomain('')
      invalidate()
    },
  })
  const verifyMutation = useMutation({
    mutationFn: (id: number) => verifyAgentDomain(id),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Verification failed'))
        return
      }
      toast.success(t('Domain verified'))
      invalidate()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAgentDomain(id),
    onSuccess: () => {
      toast.success(t('Domain deleted'))
      invalidate()
    },
  })

  return (
    <div className='space-y-4'>
      <div className='flex items-end gap-2'>
        <div className='flex-1 space-y-1'>
          <Label>{t('Add Domain')}</Label>
          <Input
            placeholder='console.example.com'
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
          />
        </div>
        <Button
          onClick={() => addMutation.mutate()}
          disabled={addMutation.isPending || !newDomain}
        >
          {t('Add')}
        </Button>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'After adding, create a DNS TXT record then click Verify. Point your domain (CNAME/A) to this platform.'
        )}
      </p>
      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Domain')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('TXT Record')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className='text-center'>
                  {t('Loading...')}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && domains.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className='text-muted-foreground text-center'
                >
                  {t('No data')}
                </TableCell>
              </TableRow>
            )}
            {domains.map((d) => (
              <TableRow key={d.id}>
                <TableCell className='font-medium'>{d.domain}</TableCell>
                <TableCell>
                  <StatusBadge
                    label={d.verified ? t('Verified') : t('Pending')}
                    variant={d.verified ? 'success' : 'warning'}
                    copyable={false}
                  />
                </TableCell>
                <TableCell className='text-xs'>
                  {d.verified ? (
                    '-'
                  ) : (
                    <div className='space-y-0.5'>
                      <div>
                        <span className='text-muted-foreground'>
                          {t('Host')}:{' '}
                        </span>
                        {verifyTxt}.{d.domain}
                      </div>
                      <div className='break-all'>
                        <span className='text-muted-foreground'>
                          {t('Value')}:{' '}
                        </span>
                        {d.verify_token}
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell className='space-x-1 text-right'>
                  {!d.verified && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => verifyMutation.mutate(d.id)}
                      disabled={verifyMutation.isPending}
                    >
                      {t('Verify')}
                    </Button>
                  )}
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => deleteMutation.mutate(d.id)}
                  >
                    {t('Delete')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function RatiosTab({ sellGroupRatios }: { sellGroupRatios?: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [text, setText] = useState(() => {
    if (!sellGroupRatios) return '{\n  "default": 1\n}'
    try {
      return JSON.stringify(JSON.parse(sellGroupRatios), null, 2)
    } catch {
      return sellGroupRatios
    }
  })

  const mutation = useMutation({
    mutationFn: (ratios: Record<string, number>) => updateAgentRatios(ratios),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Saved'))
      queryClient.invalidateQueries({ queryKey: ['agent-console-self'] })
    },
  })

  const handleSave = () => {
    let parsed: Record<string, number>
    try {
      parsed = JSON.parse(text)
    } catch {
      toast.error(t('Invalid JSON'))
      return
    }
    mutation.mutate(parsed)
  }

  return (
    <div className='max-w-2xl space-y-3'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Custom consumption ratios per group (JSON). The floor is 90% of the platform ratio; lower values are raised at billing time.'
        )}
      </p>
      <Textarea
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className='font-mono'
      />
      <Button onClick={handleSave} disabled={mutation.isPending}>
        {t('Save')}
      </Button>
    </div>
  )
}

const PROVIDER_LABELS: Record<string, string> = {
  epay: 'EPay',
  stripe: 'Stripe',
}

const CRED_LABELS: Record<string, string> = {
  pay_address: 'Gateway URL',
  epay_id: 'Merchant ID',
  epay_key: 'Merchant Key',
  api_secret: 'API Secret',
  webhook_secret: 'Webhook Secret',
  price_id: 'Price ID',
  promotion_codes: 'Allow Promotion Codes (true/false)',
}

function PaymentTab() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['agent-console-payment'],
    queryFn: getAgentPaymentConfigs,
  })
  const providers = data?.data?.providers ?? []
  const credKeys = data?.data?.cred_keys ?? {}
  const configs = data?.data?.configs ?? []
  const byProvider = new Map(configs.map((c) => [c.provider, c]))

  if (isLoading) {
    return <p className='text-muted-foreground'>{t('Loading...')}</p>
  }

  return (
    <div className='space-y-6'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Configure your own payment gateways. Credentials are encrypted at rest and never returned. Leave credential fields blank to keep existing values.'
        )}
      </p>
      {providers.map((p) => (
        <PaymentProviderCard
          key={p}
          provider={p}
          credKeys={credKeys[p] ?? []}
          config={byProvider.get(p)}
        />
      ))}
    </div>
  )
}

function PaymentProviderCard({
  provider,
  credKeys,
  config,
}: {
  provider: string
  credKeys: string[]
  config?: AgentPaymentConfigView
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(config?.enabled ?? false)
  const [unitPrice, setUnitPrice] = useState(String(config?.unit_price ?? 0))
  const [minTopup, setMinTopup] = useState(String(config?.min_topup ?? 0))
  const [creds, setCreds] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: () =>
      updateAgentPayment({
        provider,
        enabled,
        unit_price: Number(unitPrice) || 0,
        min_topup: Number(minTopup) || 0,
        creds,
      }),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Saved'))
      setCreds({})
      queryClient.invalidateQueries({ queryKey: ['agent-console-payment'] })
    },
  })

  return (
    <div className='max-w-2xl space-y-3 rounded-lg border p-4'>
      <div className='flex items-center justify-between'>
        <h3 className='text-base font-semibold'>
          {PROVIDER_LABELS[provider] ?? provider}
        </h3>
        <div className='flex items-center gap-2'>
          <Switch
            id={`pay-${provider}`}
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <Label htmlFor={`pay-${provider}`}>{t('Enabled')}</Label>
        </div>
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-1'>
          <Label>{t('Unit Price (0 = platform default)')}</Label>
          <Input
            type='number'
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
        <div className='space-y-1'>
          <Label>{t('Min Top-up (0 = platform default)')}</Label>
          <Input
            type='number'
            value={minTopup}
            onChange={(e) => setMinTopup(e.target.value)}
          />
        </div>
      </div>
      {credKeys.map((k) => (
        <div key={k} className='space-y-1'>
          <Label>{t(CRED_LABELS[k] ?? k)}</Label>
          <Input
            type={k === 'promotion_codes' ? 'text' : 'password'}
            autoComplete='new-password'
            placeholder={
              config?.has_creds ? t('Configured (leave blank to keep)') : ''
            }
            value={creds[k] ?? ''}
            onChange={(e) => setCreds((v) => ({ ...v, [k]: e.target.value }))}
          />
        </div>
      ))}
      <div className='flex items-center gap-3'>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {t('Save')}
        </Button>
        <StatusBadge
          label={config?.has_creds ? t('Configured') : t('Not configured')}
          variant={config?.has_creds ? 'success' : 'neutral'}
          copyable={false}
        />
      </div>
    </div>
  )
}

function WalletTab({
  walletQuota,
  costRatio,
}: {
  walletQuota: number
  costRatio: number
}) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['agent-console-ledgers'],
    queryFn: getAgentConsoleLedgers,
  })
  const ledgers: AgentLedger[] = data?.data?.items ?? []

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-6'>
        <div>
          <p className='text-muted-foreground text-sm'>{t('Wallet Balance')}</p>
          <p className='text-2xl font-semibold'>{formatQuota(walletQuota)}</p>
        </div>
        <div>
          <p className='text-muted-foreground text-sm'>
            {t('Settlement Discount')}
          </p>
          <p className='text-2xl font-semibold'>{costRatio}</p>
        </div>
      </div>
      <PrepayCard />
      <div className='rounded-lg border'>
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
    </div>
  )
}

function UsersTab() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['agent-console-users'],
    queryFn: getAgentConsoleUsers,
  })
  const users: AgentTerminalUser[] = data?.data?.items ?? []

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('ID')}</TableHead>
            <TableHead>{t('Username')}</TableHead>
            <TableHead>{t('Quota')}</TableHead>
            <TableHead>{t('Used Quota')}</TableHead>
            <TableHead>{t('Created At')}</TableHead>
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
          {!isLoading && users.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className='text-muted-foreground text-center'
              >
                {t('No data')}
              </TableCell>
            </TableRow>
          )}
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.id}</TableCell>
              <TableCell className='font-medium'>{u.username}</TableCell>
              <TableCell>{formatQuota(u.quota)}</TableCell>
              <TableCell>{formatQuota(u.used_quota)}</TableCell>
              <TableCell className='text-muted-foreground text-sm'>
                {u.created_at ? formatTimestamp(u.created_at) : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
