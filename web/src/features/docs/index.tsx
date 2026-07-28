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
import { ChevronDown, Download } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import { DocSection, TocMethodTag } from './components/doc-blocks'
import {
  buildCategoryMarkdown,
  buildDocGroups,
  type DocCategory,
  type DocGroup,
  type DocLang,
} from './doc-data'

type SectionMeta = { id: string; groupId: string; catId: string | null }

const firstIdOf = (cat: DocCategory): string =>
  cat.items ? cat.items[0].id : cat.id

type DocTabDef = {
  id: string
  labelZh: string
  labelEn: string
  groupIds: string[]
}

const DOC_TABS: DocTabDef[] = [
  {
    id: 'guide',
    labelZh: '用户指南',
    labelEn: 'User Guides',
    groupIds: ['start', 'guides'],
  },
  {
    id: 'usecase',
    labelZh: '场景示例',
    labelEn: 'Use Cases',
    groupIds: ['tools'],
  },
  {
    id: 'apiref',
    labelZh: 'API 参考',
    labelEn: 'API Reference',
    groupIds: ['ai', 'images', 'video', 'reference'],
  },
  { id: 'faq', labelZh: '常见问题', labelEn: 'FAQ', groupIds: ['faq'] },
]

const groupTabId = (groupId: string): string =>
  DOC_TABS.find((tab) => tab.groupIds.includes(groupId))?.id ?? DOC_TABS[0].id

export function Docs() {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()

  const lang: DocLang = i18n.language?.toLowerCase().startsWith('zh')
    ? 'zh'
    : 'en'
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const pendingScroll = useRef<{ top?: boolean; id?: string } | null>(null)

  const serverAddress = useMemo(() => {
    const s = status as Record<string, unknown> | null
    const addr =
      (s?.server_address as string | undefined) ??
      (s?.serverAddress as string | undefined)
    if (addr && typeof addr === 'string') return addr
    return typeof window !== 'undefined' ? window.location.origin : ''
  }, [status])

  const groups = useMemo(
    () => buildDocGroups(serverAddress, lang),
    [serverAddress, lang]
  )

  const sections = useMemo<SectionMeta[]>(() => {
    const arr: SectionMeta[] = []
    groups.forEach((g) =>
      g.categories.forEach((c) => {
        if (c.items) {
          c.items.forEach((it) =>
            arr.push({ id: it.id, groupId: g.id, catId: c.id })
          )
        } else {
          arr.push({ id: c.id, groupId: g.id, catId: null })
        }
      })
    )
    return arr
  }, [groups])

  const sectionMeta = useMemo<Record<string, SectionMeta>>(() => {
    const map: Record<string, SectionMeta> = {}
    sections.forEach((s) => {
      map[s.id] = s
    })
    return map
  }, [sections])

  const pages = useMemo(() => {
    const arr: { key: string; group: DocGroup; cat: DocCategory }[] = []
    groups.forEach((g) =>
      g.categories.forEach((c) =>
        arr.push({ key: `${g.id}/${c.id}`, group: g, cat: c })
      )
    )
    return arr
  }, [groups])

  const initialSel = useMemo(() => {
    const raw = decodeURIComponent(
      (typeof window !== 'undefined' ? window.location.hash : '').replace(
        /^#/,
        ''
      )
    )
    if (raw && sectionMeta[raw]) {
      const m = sectionMeta[raw]
      return { catKey: `${m.groupId}/${m.catId ?? raw}`, id: raw }
    }
    const byCat = pages.find((p) => p.cat.id === raw)
    if (byCat) return { catKey: byCat.key, id: firstIdOf(byCat.cat) }
    const first = pages[0]
    return {
      catKey: first?.key,
      id: first ? firstIdOf(first.cat) : undefined,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, sectionMeta])

  const [activeCatKey, setActiveCatKey] = useState(initialSel.catKey)
  const [activeId, setActiveId] = useState(initialSel.id)
  const [openGroups, setOpenGroups] = useState<string[]>(() =>
    groups.map((g) => g.id)
  )
  const [openCats, setOpenCats] = useState<string[]>(() => {
    const m = sectionMeta[initialSel.id ?? '']
    return m?.catId ? [m.catId] : []
  })

  const activePage = useMemo(
    () => pages.find((p) => p.key === activeCatKey) || pages[0],
    [pages, activeCatKey]
  )

  const activeTab = useMemo(
    () => (activePage ? groupTabId(activePage.group.id) : DOC_TABS[0].id),
    [activePage]
  )

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '-90px 0px -72% 0px', threshold: 0 }
    )
    sections.forEach((s) => {
      const el = sectionRefs.current[s.id]
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [sections, activeCatKey])

  useEffect(() => {
    const p = pendingScroll.current
    pendingScroll.current = null
    if (!p) return
    if (p.top) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else if (p.id) {
      const el = sectionRefs.current[p.id]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activeCatKey, activeId])

  useEffect(() => {
    const catId = sectionMeta[activeId ?? '']?.catId
    if (catId) {
      setOpenCats((prev) => (prev.includes(catId) ? prev : [...prev, catId]))
    }
  }, [activeId, sectionMeta])

  const setRef = (id: string) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el
  }

  const updateHash = (id: string) => {
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', `#${id}`)
    }
  }

  const selectCategory = (group: DocGroup, cat: DocCategory) => {
    setActiveCatKey(`${group.id}/${cat.id}`)
    setActiveId(firstIdOf(cat))
    pendingScroll.current = { top: true }
    updateHash(cat.id)
  }

  const selectTab = (tabId: string) => {
    const tab = DOC_TABS.find((tabDef) => tabDef.id === tabId)
    if (!tab) return
    const group = groups.find((g) => tab.groupIds.includes(g.id))
    const cat = group?.categories[0]
    if (!group || !cat) return
    if (cat.items) {
      setOpenCats((prev) => (prev.includes(cat.id) ? prev : [...prev, cat.id]))
    }
    selectCategory(group, cat)
  }

  const selectItem = (
    group: DocGroup,
    cat: DocCategory,
    item: { id: string }
  ) => {
    setActiveCatKey(`${group.id}/${cat.id}`)
    setActiveId(item.id)
    pendingScroll.current = { id: item.id }
    updateHash(item.id)
  }

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  const toggleCat = (id: string) =>
    setOpenCats((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  const handleDownload = () => {
    if (!activePage) return
    const { group, cat } = activePage
    const safeName = cat.label.replaceAll(/[\\/:*?"<>|]/g, '_')
    const markdown = buildCategoryMarkdown(
      serverAddress,
      group.id,
      cat.id,
      lang
    )
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeName}.md`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    toast.success(t('Documentation downloaded'))
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='mx-auto w-full max-w-7xl px-4 pt-20 pb-16'>
        <div className='border-border mb-8 flex items-center gap-6 overflow-x-auto border-b'>
          {DOC_TABS.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type='button'
                onClick={() => selectTab(tab.id)}
                className={cn(
                  '-mb-px shrink-0 border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground border-transparent'
                )}
              >
                {lang === 'zh' ? tab.labelZh : tab.labelEn}
              </button>
            )
          })}
        </div>
        <div className='flex flex-col gap-8 lg:flex-row'>
          <aside className='lg:w-72 lg:shrink-0'>
            <div className='lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2'>
              {groups
                .filter((group) => groupTabId(group.id) === activeTab)
                .map((group) => {
                  const groupOpen = openGroups.includes(group.id)
                  return (
                    <div key={group.id} className='mb-2'>
                      <button
                        type='button'
                        onClick={() => toggleGroup(group.id)}
                        className='hover:text-foreground flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold'
                      >
                        <ChevronDown
                          className={cn(
                            'size-4 transition-transform',
                            groupOpen ? '' : '-rotate-90'
                          )}
                        />
                        <span>{group.superLabel}</span>
                      </button>
                      {groupOpen &&
                        group.categories.map((cat) => {
                          const catKey = `${group.id}/${cat.id}`
                          const isActiveCat = activeCatKey === catKey
                          if (!cat.items) {
                            return (
                              <button
                                type='button'
                                key={cat.id}
                                onClick={() => selectCategory(group, cat)}
                                className={cn(
                                  'ml-6 flex w-[calc(100%-1.5rem)] items-center rounded-md px-2 py-1.5 text-left text-sm',
                                  isActiveCat
                                    ? 'bg-accent text-accent-foreground font-medium'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                {cat.label}
                              </button>
                            )
                          }
                          const catOpen = openCats.includes(cat.id)
                          return (
                            <div key={cat.id}>
                              <button
                                type='button'
                                onClick={() => {
                                  toggleCat(cat.id)
                                  selectCategory(group, cat)
                                }}
                                className={cn(
                                  'ml-6 flex w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm',
                                  isActiveCat
                                    ? 'text-foreground font-medium'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                <ChevronDown
                                  className={cn(
                                    'size-3.5 shrink-0 transition-transform',
                                    catOpen ? '' : '-rotate-90'
                                  )}
                                />
                                <span>{cat.label}</span>
                              </button>
                              {catOpen &&
                                cat.items.map((item) => (
                                  <button
                                    type='button'
                                    key={item.id}
                                    onClick={() => selectItem(group, cat, item)}
                                    className={cn(
                                      'ml-12 flex w-[calc(100%-3rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                                      activeId === item.id
                                        ? 'bg-accent text-accent-foreground font-medium'
                                        : 'text-muted-foreground hover:text-foreground'
                                    )}
                                  >
                                    <span className='truncate'>
                                      {item.label}
                                    </span>
                                    <TocMethodTag method={item.method} />
                                  </button>
                                ))}
                            </div>
                          )
                        })}
                    </div>
                  )
                })}
            </div>
          </aside>

          <main className='min-w-0 flex-1'>
            <header className='border-border mb-4 border-b pb-6'>
              <span className='bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'>
                {t('Developer Docs')}
              </span>
              <h1 className='mt-3 text-2xl font-bold'>
                {t('API Documentation')}
              </h1>
              <p className='text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed'>
                {t(
                  'Access chat, completions, embeddings, reranking, moderation, audio, image, and video capabilities through a unified API compatible with OpenAI / Claude / Gemini formats. A single API key is all downstream clients need.'
                )}
              </p>
              <div className='mt-4 flex flex-wrap items-center gap-3'>
                <div className='border-border bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-1.5'>
                  <span className='text-muted-foreground text-xs'>
                    base_url
                  </span>
                  <code className='font-mono text-sm'>{serverAddress}</code>
                  <CopyButton
                    value={serverAddress}
                    size='icon'
                    variant='ghost'
                    className='size-6'
                  />
                </div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleDownload}
                >
                  <Download className='size-4' />
                  {t('Download Markdown')}
                </Button>
              </div>
            </header>

            {activePage &&
              (activePage.cat.items ? (
                activePage.cat.items.map((item) => (
                  <DocSection
                    key={item.id}
                    id={item.id}
                    eyebrow={activePage.cat.label}
                    title={item.label}
                    method={item.method}
                    blocks={item.blocks}
                    setRef={setRef}
                  />
                ))
              ) : (
                <DocSection
                  key={activePage.cat.id}
                  id={activePage.cat.id}
                  title={activePage.cat.label}
                  blocks={activePage.cat.blocks ?? []}
                  setRef={setRef}
                />
              ))}
          </main>
        </div>
      </div>
    </PublicLayout>
  )
}
