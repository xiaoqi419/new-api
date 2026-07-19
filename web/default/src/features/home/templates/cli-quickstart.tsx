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
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CodeBlock } from '@/components/ai-elements/code-block'
import { AnimateInView } from '@/components/animate-in-view'
import { CopyButton } from '@/components/copy-button'
import { Footer } from '@/components/layout/components/footer'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { getSystemName } from '@/stores/system-config-store'

import type {
  CliCodeStep,
  CliQuickstartContent,
  CliRoadmapStatus,
  CliToolCard,
} from '../types'
import { ToolIcon } from './cli-quickstart-icons'
import { getDefaultCliContent, mergeCliContent } from './defaults'

import './cli-quickstart.css'

interface CliQuickstartProps {
  content?: unknown
  isAuthenticated: boolean
}

/** Resolve this instance's public URL: admin Server Address, else origin. */
function resolveBaseUrl(): string {
  try {
    const raw = localStorage.getItem('status')
    if (raw) {
      const status = JSON.parse(raw)
      if (status?.server_address) return String(status.server_address)
    }
  } catch {
    // Ignore malformed cache; fall back to the current origin.
  }
  return window.location.origin
}

/** Pick the animated mark: explicit icon, else inferred from the tool name so
 * configs saved before the icon field still render the right brand logo. */
function resolveToolIcon(tool: CliToolCard): string {
  if (tool.icon) return tool.icon
  const name = tool.name.toLowerCase()
  if (name.includes('claude')) return 'claude'
  if (name.includes('codex') || name.includes('openai')) return 'openai'
  if (name.includes('gemini')) return 'gemini'
  return 'generic'
}

function CodeStep({ step, baseUrl }: { step: CliCodeStep; baseUrl: string }) {
  const code = step.code.replaceAll('{{base_url}}', baseUrl)
  return (
    <div className='literary-code'>
      <div className='literary-code-head'>
        <span className='literary-code-name'>{step.filename}</span>
        <CopyButton value={code} className='size-7' iconClassName='size-3.5' />
      </div>
      <CodeBlock
        code={code}
        language={step.language}
        className='my-0 rounded-none border-0 bg-transparent shadow-none'
      />
    </div>
  )
}

function ToolContent({
  tool,
  baseUrl,
}: {
  tool: CliToolCard
  baseUrl: string
}) {
  return (
    <div className='w-full'>
      <div className='mb-4 flex flex-wrap items-center gap-2'>
        <span className='literary-badge'>{tool.badge}</span>
        {tool.tags.map((tag) => (
          <span
            key={tag}
            className='text-muted-foreground font-mono text-[10px] tracking-wider uppercase'
          >
            {tag}
          </span>
        ))}
      </div>
      <h3 className='literary-title text-3xl md:text-4xl'>{tool.name}</h3>
      <p className='literary-prose text-muted-foreground mt-3 text-sm leading-relaxed'>
        {tool.description}
      </p>
      <div className='mt-6 flex flex-col gap-3'>
        {tool.steps.map((step) => (
          <CodeStep key={step.filename} step={step} baseUrl={baseUrl} />
        ))}
      </div>
    </div>
  )
}

function ToolSection({
  tool,
  baseUrl,
  iconLeft,
}: {
  tool: CliToolCard
  baseUrl: string
  iconLeft: boolean
}) {
  return (
    <section className='literary-section'>
      <div className='mx-auto grid w-full max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-14'>
        <AnimateInView
          animation='scale-in'
          once={false}
          className={`flex items-center justify-center ${iconLeft ? 'md:order-1' : 'md:order-2'}`}
        >
          <div className='aspect-square w-[min(56vw,17rem)]'>
            <ToolIcon icon={resolveToolIcon(tool)} />
          </div>
        </AnimateInView>
        <AnimateInView
          animation='fade-up'
          className={`flex ${iconLeft ? 'md:order-2' : 'md:order-1'}`}
        >
          <ToolContent tool={tool} baseUrl={baseUrl} />
        </AnimateInView>
      </div>
    </section>
  )
}

/**
 * CLI quickstart template: a developer onboarding landing page with terminal
 * install + config snippets for the major AI coding CLIs and a feature roadmap.
 * Unset fields fall back to the built-in defaults.
 */
export function CliQuickstart({
  content,
  isAuthenticated,
}: CliQuickstartProps) {
  const { t } = useTranslation()
  const c = mergeCliContent(
    getDefaultCliContent(t),
    content as Partial<CliQuickstartContent> | undefined
  )
  const baseUrl = resolveBaseUrl()
  const systemName = getSystemName() || 'New API'

  const statusMeta: Record<
    CliRoadmapStatus,
    { label: string; variant: 'success' | 'warning' | 'neutral' }
  > = {
    done: { label: t('Completed'), variant: 'success' },
    'in-progress': { label: t('In Progress'), variant: 'warning' },
    planned: { label: t('Planned'), variant: 'neutral' },
  }

  return (
    <div className='literary'>
      <div aria-hidden className='literary-grid' />
      <div className='literary-scroll'>
        {/* Hero */}
        <section className='literary-section relative items-center text-center'>
          <div className='mx-auto flex max-w-3xl flex-col items-center'>
            <AnimateInView animation='fade-up'>
              <span className='border-primary/30 text-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium'>
                <span className='relative flex size-1.5'>
                  <span className='bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75' />
                  <span className='bg-primary relative inline-flex size-1.5 rounded-full' />
                </span>
                {c.hero.badge}
              </span>
            </AnimateInView>
            <AnimateInView animation='fade-up' delay={80}>
              <h1 className='literary-title mt-6 text-[clamp(2.25rem,5vw,3.75rem)]'>
                {c.hero.title} {systemName}
                <span aria-hidden className='literary-cursor' />
              </h1>
            </AnimateInView>
            <AnimateInView animation='fade-up' delay={160}>
              <p className='literary-subtitle text-foreground/80 mt-5 text-xl md:text-2xl'>
                {c.hero.subtitle}
              </p>
            </AnimateInView>
            <AnimateInView animation='fade-up' delay={220}>
              <p className='literary-prose text-muted-foreground mx-auto mt-3 max-w-xl text-sm leading-relaxed'>
                {c.hero.description}
              </p>
            </AnimateInView>
            <AnimateInView animation='fade-up' delay={300}>
              <Button
                className='group mt-9 h-11 rounded-lg px-6 text-sm font-medium'
                render={
                  <Link to={isAuthenticated ? '/dashboard' : '/sign-up'} />
                }
              >
                {c.hero.ctaLabel}
                <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
              </Button>
            </AnimateInView>
          </div>
          <ChevronDown
            aria-hidden
            className='literary-scrollhint text-muted-foreground absolute bottom-8 left-1/2 size-5 -translate-x-1/2'
          />
        </section>

        {/* One full-screen snap section per tool, alternating icon side */}
        {c.tools.map((tool, i) => (
          <ToolSection
            key={tool.name}
            tool={tool}
            baseUrl={baseUrl}
            iconLeft={i % 2 === 0}
          />
        ))}

        {/* Roadmap */}
        <section className='literary-section'>
          <div className='mx-auto w-full max-w-4xl'>
            <AnimateInView animation='fade-up' className='mb-10 text-center'>
              <span className='literary-eyebrow text-muted-foreground text-[10px] font-bold'>
                {c.roadmap.badge}
              </span>
              <h2 className='literary-title mt-3 text-3xl md:text-4xl'>
                {c.roadmap.heading}
              </h2>
              <p className='literary-prose text-muted-foreground mx-auto mt-3 max-w-lg text-sm'>
                {c.roadmap.subtitle}
              </p>
            </AnimateInView>
            <div className='grid gap-4 sm:grid-cols-3'>
              {c.roadmap.items.map((item, i) => (
                <AnimateInView
                  key={item.title}
                  animation='fade-up'
                  delay={i * 80}
                  className='literary-card flex flex-col gap-3 p-5'
                >
                  <div>
                    <StatusBadge
                      label={statusMeta[item.status].label}
                      variant={statusMeta[item.status].variant}
                      copyable={false}
                    />
                  </div>
                  <h3 className='literary-title text-base'>{item.title}</h3>
                  <p className='literary-prose text-muted-foreground text-xs leading-relaxed'>
                    {item.description}
                  </p>
                </AnimateInView>
              ))}
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </div>
  )
}
