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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { cn } from '@/lib/utils'

import type { DocBlock, DocParamRow } from '../doc-data'

const METHOD_CLASSES: Record<string, string> = {
  GET: 'bg-success/15 text-success',
  POST: 'bg-chart-1/15 text-chart-1',
  PUT: 'bg-warning/15 text-warning',
  PATCH: 'bg-chart-4/15 text-chart-4',
  DELETE: 'bg-destructive/15 text-destructive',
}

function methodClass(method: string): string {
  return (
    METHOD_CLASSES[method.toUpperCase()] ?? 'bg-muted text-muted-foreground'
  )
}

// Lightweight inline markup: `code` -> <code>, **bold** -> <b>
function renderInline(text: string): ReactNode {
  if (typeof text !== 'string') return text
  const nodes: ReactNode[] = []
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key++}
          className='bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]'
        >
          {token.slice(1, -1)}
        </code>
      )
    } else {
      nodes.push(
        <b key={key++} className='font-semibold'>
          {token.slice(2, -2)}
        </b>
      )
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function MethodBadge({
  method,
  className,
}: {
  method: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] leading-none font-semibold uppercase',
        methodClass(method),
        className
      )}
    >
      {method}
    </span>
  )
}

export function TocMethodTag({ method }: { method?: string }) {
  if (!method) return null
  return <MethodBadge method={method} className='ml-auto shrink-0' />
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className='border-border bg-muted/40 my-4 overflow-hidden rounded-lg border'>
      <div className='border-border/60 flex items-center justify-between border-b px-3 py-1.5'>
        <span className='text-muted-foreground font-mono text-xs'>
          {label ?? ''}
        </span>
        <CopyButton
          value={code}
          size='sm'
          variant='ghost'
          className='text-muted-foreground hover:text-foreground h-6 gap-1 px-2 text-xs'
        />
      </div>
      <pre className='overflow-x-auto p-3 text-xs leading-relaxed'>
        <code className='font-mono'>{code}</code>
      </pre>
    </div>
  )
}

function Endpoint({ method, path }: { method: string; path: string }) {
  return (
    <div className='border-border bg-muted/40 my-4 flex items-center gap-2 rounded-lg border px-3 py-2'>
      <MethodBadge method={method} />
      <code className='font-mono text-sm break-all'>{path}</code>
    </div>
  )
}

function ParamsTable({ rows }: { rows: DocParamRow[] }) {
  const { t } = useTranslation()
  return (
    <div className='border-border my-4 overflow-x-auto rounded-lg border'>
      <table className='w-full text-sm'>
        <thead className='bg-muted/60 text-muted-foreground'>
          <tr>
            <th className='px-3 py-2 text-left font-medium'>
              {t('Parameter')}
            </th>
            <th className='px-3 py-2 text-left font-medium'>{t('Type')}</th>
            <th className='px-3 py-2 text-left font-medium'>{t('Required')}</th>
            <th className='px-3 py-2 text-left font-medium'>{t('Default')}</th>
            <th className='px-3 py-2 text-left font-medium'>
              {t('Description')}
            </th>
          </tr>
        </thead>
        <tbody className='divide-border divide-y'>
          {rows.map((r) => (
            <tr key={r.name} className='align-top'>
              <td className='px-3 py-2'>
                <code className='bg-muted rounded px-1 py-0.5 font-mono text-xs'>
                  {r.name}
                </code>
              </td>
              <td className='text-muted-foreground px-3 py-2 font-mono text-xs'>
                {r.type}
              </td>
              <td className='px-3 py-2'>{r.required ? t('Yes') : t('No')}</td>
              <td className='text-muted-foreground px-3 py-2'>
                {r.default || '-'}
              </td>
              <td className='px-3 py-2'>{renderInline(r.desc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GenericTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className='border-border my-4 overflow-x-auto rounded-lg border'>
      <table className='w-full text-sm'>
        <thead className='bg-muted/60 text-muted-foreground'>
          <tr>
            {head.map((h) => (
              <th key={h} className='px-3 py-2 text-left font-medium'>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='divide-border divide-y'>
          {rows.map((row) => {
            const rowKey = row.join('¦')
            const cells = row.map((cell, col) => ({
              cell,
              col: head[col] ?? String(col),
            }))
            return (
              <tr key={rowKey} className='align-top'>
                {cells.map((c) => (
                  <td key={`${rowKey}¦${c.col}`} className='px-3 py-2'>
                    {renderInline(c.cell)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case 'p':
      return (
        <p className='text-muted-foreground my-3 leading-relaxed'>
          {renderInline(block.text)}
        </p>
      )
    case 'note':
      return (
        <p className='border-primary/40 bg-muted/40 text-muted-foreground my-4 rounded-md border-l-2 py-2 pr-3 pl-3 text-sm leading-relaxed'>
          {renderInline(block.text)}
        </p>
      )
    case 'h3':
      return <h3 className='mt-6 mb-2 text-base font-semibold'>{block.text}</h3>
    case 'endpoint':
      return <Endpoint method={block.method} path={block.path} />
    case 'code':
      return <CodeBlock label={block.label} code={block.code} />
    case 'params':
      return <ParamsTable rows={block.rows} />
    case 'table':
      return <GenericTable head={block.head} rows={block.rows} />
    case 'list':
      return (
        <ul className='text-muted-foreground my-3 list-disc space-y-1 pl-5 leading-relaxed'>
          {block.items.map((it) => (
            <li key={it}>{renderInline(it)}</li>
          ))}
        </ul>
      )
    case 'cards':
      return (
        <div className='my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {block.cards.map((c) => (
            <div
              key={c.title}
              className='border-border bg-card rounded-lg border p-4'
            >
              <h4 className='mb-1 text-sm font-semibold'>{c.title}</h4>
              <p className='text-muted-foreground text-sm leading-relaxed'>
                {c.desc}
              </p>
            </div>
          ))}
        </div>
      )
    default:
      return null
  }
}

function blockKey(block: DocBlock): string {
  switch (block.kind) {
    case 'p':
    case 'note':
    case 'h3':
      return `${block.kind}:${block.text}`
    case 'endpoint':
      return `endpoint:${block.method}:${block.path}`
    case 'code':
      return `code:${block.label ?? ''}:${block.code}`
    case 'params':
      return `params:${block.rows.map((r) => r.name).join(',')}`
    case 'table':
      return `table:${block.head.join(',')}`
    case 'list':
      return `list:${block.items.join('|')}`
    case 'cards':
      return `cards:${block.cards.map((c) => c.title).join(',')}`
    default:
      return 'block'
  }
}

export function DocSection({
  id,
  eyebrow,
  title,
  method,
  blocks,
  setRef,
}: {
  id: string
  eyebrow?: string
  title: string
  method?: string
  blocks: DocBlock[]
  setRef: (id: string) => (el: HTMLElement | null) => void
}) {
  const seen = new Map<string, number>()
  return (
    <section id={id} ref={setRef(id)} className='scroll-mt-24 py-6'>
      {eyebrow && (
        <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
          {eyebrow}
        </span>
      )}
      <h2 className='mt-1 flex items-center gap-2 text-xl font-semibold'>
        {title}
        {method && <MethodBadge method={method} />}
      </h2>
      {blocks.map((block) => {
        const base = blockKey(block)
        const n = seen.get(base) ?? 0
        seen.set(base, n + 1)
        return <Block key={n ? `${base}#${n}` : base} block={block} />
      })}
    </section>
  )
}
