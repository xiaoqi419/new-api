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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Rocket,
  Sparkles,
  TerminalSquare,
} from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getSelf, getUserModels } from '@/lib/api'
import { normalizeApiBaseUrl } from '@/lib/api-base-url'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

const CODE_KEY_PLACEHOLDER = 'YOUR_API_KEY'

function buildCurl(baseUrl: string, model: string): string {
  return [
    `curl ${baseUrl}/chat/completions \\`,
    '  -H "Content-Type: application/json" \\',
    `  -H "Authorization: Bearer ${CODE_KEY_PLACEHOLDER}" \\`,
    "  -d '{",
    `    "model": "${model}",`,
    '    "messages": [{"role": "user", "content": "Hello!"}]',
    "  }'",
  ].join('\n')
}

function buildPython(baseUrl: string, model: string): string {
  return [
    'from openai import OpenAI',
    '',
    'client = OpenAI(',
    `    base_url="${baseUrl}",`,
    `    api_key="${CODE_KEY_PLACEHOLDER}",`,
    ')',
    '',
    'resp = client.chat.completions.create(',
    `    model="${model}",`,
    '    messages=[{"role": "user", "content": "Hello!"}],',
    ')',
    'print(resp.choices[0].message.content)',
  ].join('\n')
}

function buildNode(baseUrl: string, model: string): string {
  return [
    "import OpenAI from 'openai'",
    '',
    'const client = new OpenAI({',
    `  baseURL: '${baseUrl}',`,
    `  apiKey: '${CODE_KEY_PLACEHOLDER}',`,
    '})',
    '',
    'const resp = await client.chat.completions.create({',
    `  model: '${model}',`,
    "  messages: [{ role: 'user', content: 'Hello!' }],",
    '})',
    'console.log(resp.choices[0].message.content)',
  ].join('\n')
}

interface CodeExample {
  id: string
  label: string
  code: string
}

function CodeBlock(props: { code: string }) {
  const { t } = useTranslation()
  const { copyToClipboard, copiedText } = useCopyToClipboard()
  const isCopied = copiedText === props.code

  return (
    <div className='overflow-hidden rounded-xl border border-white/10 bg-[#1e1e1e] shadow-sm'>
      <div className='flex items-center justify-between border-b border-white/10 px-3 py-2'>
        <div className='flex items-center gap-1.5'>
          <span className='size-2.5 rounded-full bg-[#ff5f56]' />
          <span className='size-2.5 rounded-full bg-[#ffbd2e]' />
          <span className='size-2.5 rounded-full bg-[#27c93f]' />
        </div>
        <Button
          variant='ghost'
          size='sm'
          className='h-7 gap-1.5 px-2 text-xs text-white/70 hover:bg-white/10 hover:text-white'
          onClick={() => void copyToClipboard(props.code)}
        >
          {isCopied ? (
            <Check data-icon='inline-start' />
          ) : (
            <Copy data-icon='inline-start' />
          )}
          {t('Copy')}
        </Button>
      </div>
      <pre className='overflow-x-auto p-4 text-xs leading-relaxed text-white/90'>
        <code className='font-mono'>{props.code}</code>
      </pre>
    </div>
  )
}

export function Workbench() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const { items: apiInfoItems } = useApiInfo()
  const { copyToClipboard, copiedText } = useCopyToClipboard()

  const initialCount = Number(user?.request_count ?? 0)

  const modelsQuery = useQuery({
    queryKey: ['workbench', 'models'],
    queryFn: async () => {
      const res = await getUserModels()
      return res.success ? (res.data ?? []) : []
    },
    staleTime: 5 * 60 * 1000,
  })

  const selfQuery = useQuery({
    queryKey: ['workbench', 'self'],
    queryFn: getSelf,
    refetchInterval: (query) => {
      const data = query.state.data as
        | { data?: { request_count?: number } }
        | undefined
      const count = Number(data?.data?.request_count ?? initialCount)
      return count > 0 ? false : 5000
    },
    staleTime: 0,
  })

  const currentCount = Number(
    (selfQuery.data as { data?: { request_count?: number } } | undefined)?.data
      ?.request_count ?? initialCount
  )
  const hasFirstCall = currentCount > 0

  const baseUrl = normalizeApiBaseUrl(apiInfoItems[0]?.url)
  const model = modelsQuery.data?.[0] ?? 'gpt-4o-mini'
  const displayName = user?.display_name || user?.username || ''
  const isBaseUrlCopied = copiedText === baseUrl

  const examples: CodeExample[] = [
    { id: 'curl', label: 'cURL', code: buildCurl(baseUrl, model) },
    { id: 'python', label: 'Python', code: buildPython(baseUrl, model) },
    { id: 'node', label: 'Node.js', code: buildNode(baseUrl, model) },
  ]

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Workbench')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <CardStaggerContainer className='mx-auto flex w-full max-w-3xl flex-col gap-6 py-2'>
          <CardStaggerItem className='flex flex-col items-center gap-3 text-center'>
            <span className='bg-warning/10 text-warning inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium'>
              <Sparkles className='size-3.5' aria-hidden='true' />
              {t('Get started')}
            </span>
            <h1 className='text-3xl font-semibold tracking-tight sm:text-4xl'>
              {t('Hello, {{name}}!', { name: displayName })}
            </h1>
            <p className='text-muted-foreground max-w-xl text-sm leading-relaxed'>
              {t(
                'You only need to integrate once. Create an API key, point your requests at the Base URL below, and you are ready to go.'
              )}
            </p>
          </CardStaggerItem>

          <CardStaggerItem className='grid gap-4 sm:grid-cols-2'>
            <div className='bg-card ring-foreground/10 flex flex-col gap-3 rounded-xl p-4 ring-1'>
              <div className='flex items-center gap-2'>
                <TerminalSquare
                  className='text-muted-foreground size-4'
                  aria-hidden='true'
                />
                <span className='text-sm font-medium'>{t('Base URL')}</span>
              </div>
              <div className='flex items-center gap-2'>
                <code
                  className='bg-muted/50 min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-xs'
                  title={baseUrl}
                >
                  {baseUrl}
                </code>
                <Button
                  variant='outline'
                  size='icon'
                  className='size-9 shrink-0'
                  onClick={() => void copyToClipboard(baseUrl)}
                  aria-label={t('Copy')}
                >
                  {isBaseUrlCopied ? <Check /> : <Copy />}
                </Button>
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('Point your client at this endpoint.')}
              </p>
            </div>

            <div className='bg-card ring-foreground/10 flex flex-col gap-3 rounded-xl p-4 ring-1'>
              <div className='flex items-center gap-2'>
                <KeyRound
                  className='text-muted-foreground size-4'
                  aria-hidden='true'
                />
                <span className='text-sm font-medium'>
                  {t('Create API Key')}
                </span>
              </div>
              <p className='text-muted-foreground flex-1 text-xs leading-relaxed'>
                {t(
                  'Create a key for your app, then use it in the examples below.'
                )}
              </p>
              <Button className='w-full' render={<Link to='/keys' />}>
                <KeyRound data-icon='inline-start' />
                {t('Create API Key')}
              </Button>
            </div>
          </CardStaggerItem>

          <CardStaggerItem className='flex flex-col gap-3'>
            <div className='flex items-center gap-2'>
              <Rocket
                className='text-muted-foreground size-4'
                aria-hidden='true'
              />
              <h2 className='text-sm font-medium'>
                {t('Run your first API call')}
              </h2>
            </div>
            <Tabs defaultValue='curl'>
              <TabsList>
                {examples.map((ex) => (
                  <TabsTrigger key={ex.id} value={ex.id}>
                    {ex.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {examples.map((ex) => (
                <TabsContent
                  key={ex.id}
                  value={ex.id}
                  className='mt-3 outline-none'
                >
                  <CodeBlock code={ex.code} />
                </TabsContent>
              ))}
            </Tabs>
          </CardStaggerItem>

          <CardStaggerItem
            className={cn(
              'flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center transition-colors',
              hasFirstCall && 'border-success/40 bg-success/5'
            )}
          >
            {hasFirstCall ? (
              <>
                <CheckCircle2
                  className='text-success size-7'
                  aria-hidden='true'
                />
                <div className='text-sm font-medium'>
                  {t('First API call received!')}
                </div>
                <p className='text-muted-foreground max-w-md text-xs leading-relaxed'>
                  {t(
                    'Your integration is working. Check usage logs for details.'
                  )}
                </p>
                <Button
                  variant='outline'
                  size='sm'
                  render={
                    <Link
                      to='/usage-logs/$section'
                      params={{ section: 'common' }}
                    />
                  }
                >
                  {t('Usage Logs')}
                  <ArrowRight data-icon='inline-end' />
                </Button>
              </>
            ) : (
              <>
                <Loader2
                  className='text-warning size-6 animate-spin'
                  aria-hidden='true'
                />
                <div className='text-sm font-medium'>
                  {t('Waiting for your first API call')}
                </div>
                <p className='text-muted-foreground max-w-md text-xs leading-relaxed'>
                  {t(
                    'Once you send a request, its status will appear here in real time.'
                  )}
                </p>
              </>
            )}
          </CardStaggerItem>
        </CardStaggerContainer>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
