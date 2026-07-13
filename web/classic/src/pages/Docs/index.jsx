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

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconCopy,
  IconTickCircle,
  IconChevronDown,
  IconDownload,
} from '@douyinfe/semi-icons';
import { StatusContext } from '../../context/Status';
import { copy, showSuccess, downloadTextAsFile } from '../../helpers';
import { buildDocGroups, buildCategoryMarkdown } from './docData';

// Lightweight inline markup: `code` -> <code>, **bold** -> <b>
const renderInline = (text) => {
  if (typeof text !== 'string') return text;
  const nodes = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else {
      nodes.push(<b key={key++}>{token.slice(2, -2)}</b>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
};

const CodeBlock = ({ code, label }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copy(code);
    if (ok) {
      setCopied(true);
      showSuccess(t('已复制到剪切板'));
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className='app-docs-code'>
      {label && <span className='app-docs-code-label'>{label}</span>}
      <button
        type='button'
        className='app-docs-code-copy'
        onClick={handleCopy}
        aria-label={t('复制')}
      >
        {copied ? <IconTickCircle /> : <IconCopy />}
        <span>{copied ? t('已复制') : t('复制')}</span>
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
};

const Endpoint = ({ method, path }) => (
  <div className='app-docs-endpoint'>
    <span className={`app-docs-method app-docs-method-${method.toLowerCase()}`}>
      {method}
    </span>
    <code>{path}</code>
  </div>
);

const ParamsTable = ({ rows }) => (
  <table className='app-docs-table'>
    <thead>
      <tr>
        <th>参数</th>
        <th>类型</th>
        <th>必填</th>
        <th>默认</th>
        <th>说明</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r) => (
        <tr key={r.name}>
          <td>
            <code>{r.name}</code>
          </td>
          <td>{r.type}</td>
          <td>{r.required ? '是' : '否'}</td>
          <td>{r.default || '-'}</td>
          <td>{renderInline(r.desc)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const GenericTable = ({ head, rows }) => (
  <table className='app-docs-table'>
    <thead>
      <tr>
        {head.map((h) => (
          <th key={h}>{h}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, i) => (
        <tr key={i}>
          {row.map((cell, j) => (
            <td key={j}>{renderInline(cell)}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

const Block = ({ block }) => {
  switch (block.kind) {
    case 'p':
      return <p>{renderInline(block.text)}</p>;
    case 'note':
      return <p className='app-docs-note'>{renderInline(block.text)}</p>;
    case 'h3':
      return <h3>{block.text}</h3>;
    case 'endpoint':
      return <Endpoint method={block.method} path={block.path} />;
    case 'code':
      return <CodeBlock label={block.label} code={block.code} />;
    case 'params':
      return <ParamsTable rows={block.rows} />;
    case 'table':
      return <GenericTable head={block.head} rows={block.rows} />;
    case 'list':
      return (
        <ul className='app-docs-list'>
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case 'cards':
      return (
        <div className='app-docs-cards'>
          {block.cards.map((c, i) => (
            <div className='app-docs-card' key={i}>
              <h4>{c.title}</h4>
              <p>{c.desc}</p>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
};

const MethodTag = ({ method }) =>
  method ? (
    <span className={`app-docs-toc-method m-${method.toLowerCase()}`}>
      {method}
    </span>
  ) : null;

const Section = ({ id, eyebrow, title, method, blocks, setRef }) => (
  <section id={id} ref={setRef(id)} className='app-docs-section'>
    {eyebrow && <span className='app-docs-eyebrow'>{eyebrow}</span>}
    <h2>
      {title}
      {method && (
        <span
          className={`app-docs-method app-docs-method-${method.toLowerCase()} app-docs-h2-method`}
        >
          {method}
        </span>
      )}
    </h2>
    {blocks.map((block, i) => (
      <Block key={i} block={block} />
    ))}
  </section>
);

const Docs = () => {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const sectionRefs = useRef({});

  const serverAddress = useMemo(
    () => statusState?.status?.server_address || window.location.origin,
    [statusState?.status?.server_address],
  );

  const groups = useMemo(() => buildDocGroups(serverAddress), [serverAddress]);

  // Flatten to scroll-spy sections: item leaves + leaf categories.
  const sections = useMemo(() => {
    const arr = [];
    groups.forEach((g) =>
      g.categories.forEach((c) => {
        if (c.items) {
          c.items.forEach((it) =>
            arr.push({ id: it.id, groupId: g.id, catId: c.id }),
          );
        } else {
          arr.push({ id: c.id, groupId: g.id, catId: null });
        }
      }),
    );
    return arr;
  }, [groups]);

  const sectionMeta = useMemo(() => {
    const map = {};
    sections.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [sections]);

  // Each category (chat / completions / audio / an image or video format, ...)
  // is one navigable "page"; only the active one renders in the main column.
  const pages = useMemo(() => {
    const arr = [];
    groups.forEach((g) =>
      g.categories.forEach((c) =>
        arr.push({ key: `${g.id}/${c.id}`, group: g, cat: c }),
      ),
    );
    return arr;
  }, [groups]);

  const firstIdOf = (cat) => (cat.items ? cat.items[0].id : cat.id);

  const initialSel = useMemo(() => {
    const raw = decodeURIComponent(
      (typeof window !== 'undefined' ? window.location.hash : '').replace(
        /^#/,
        '',
      ),
    );
    if (raw && sectionMeta[raw]) {
      const m = sectionMeta[raw];
      return { catKey: `${m.groupId}/${m.catId ?? raw}`, id: raw };
    }
    const byCat = pages.find((p) => p.cat.id === raw);
    if (byCat) return { catKey: byCat.key, id: firstIdOf(byCat.cat) };
    const first = pages[0];
    return { catKey: first?.key, id: first ? firstIdOf(first.cat) : undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, sectionMeta]);

  const [activeCatKey, setActiveCatKey] = useState(initialSel.catKey);
  const [activeId, setActiveId] = useState(initialSel.id);
  const [openGroups, setOpenGroups] = useState(() => groups.map((g) => g.id));
  const [openCats, setOpenCats] = useState(() => {
    const m = sectionMeta[initialSel.id];
    return m?.catId ? [m.catId] : [];
  });

  const activePage = useMemo(
    () => pages.find((p) => p.key === activeCatKey) || pages[0],
    [pages, activeCatKey],
  );

  const pendingScroll = useRef(null);

  // Scroll-spy limited to the currently rendered category's sections.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-90px 0px -72% 0px', threshold: 0 },
    );
    sections.forEach((s) => {
      const el = sectionRefs.current[s.id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections, activeCatKey]);

  // After switching category/item, scroll to the requested target.
  useEffect(() => {
    const p = pendingScroll.current;
    pendingScroll.current = null;
    if (!p) return;
    if (p.top) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (p.id) {
      const el = sectionRefs.current[p.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeCatKey, activeId]);

  // Keep the active item's category expanded in the TOC while scrolling.
  useEffect(() => {
    const meta = sectionMeta[activeId];
    if (meta?.catId) {
      setOpenCats((prev) =>
        prev.includes(meta.catId) ? prev : [...prev, meta.catId],
      );
    }
  }, [activeId, sectionMeta]);

  const setRef = (id) => (el) => {
    sectionRefs.current[id] = el;
  };

  const updateHash = (id) => {
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', `#${id}`);
    }
  };

  const selectCategory = (group, cat) => {
    setActiveCatKey(`${group.id}/${cat.id}`);
    setActiveId(firstIdOf(cat));
    pendingScroll.current = { top: true };
    updateHash(cat.id);
  };

  const selectItem = (group, cat, item) => {
    setActiveCatKey(`${group.id}/${cat.id}`);
    setActiveId(item.id);
    pendingScroll.current = { id: item.id };
    updateHash(item.id);
  };

  const toggleGroup = (id) =>
    setOpenGroups((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleCat = (id) =>
    setOpenCats((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <div className='app-docs'>
      <div className='app-docs-shell'>
        <aside className='app-docs-toc'>
          <div className='app-docs-toc-inner'>
            {groups.map((group) => {
              const groupOpen = openGroups.includes(group.id);
              return (
                <div className='app-docs-toc-group' key={group.id}>
                  <button
                    type='button'
                    className={`app-docs-toc-super${groupOpen ? ' open' : ''}`}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <IconChevronDown
                      size='small'
                      className='app-docs-toc-caret'
                    />
                    <span>{group.superLabel}</span>
                  </button>
                  {groupOpen &&
                    group.categories.map((cat) => {
                      const catKey = `${group.id}/${cat.id}`;
                      if (!cat.items) {
                        return (
                          <button
                            type='button'
                            key={cat.id}
                            className={`app-docs-toc-link${activeCatKey === catKey ? ' active' : ''}`}
                            onClick={() => selectCategory(group, cat)}
                          >
                            <span className='app-docs-toc-link-text'>
                              {cat.label}
                            </span>
                          </button>
                        );
                      }
                      const catOpen = openCats.includes(cat.id);
                      return (
                        <div key={cat.id}>
                          <button
                            type='button'
                            className={`app-docs-toc-cat${catOpen ? ' open' : ''}${activeCatKey === catKey ? ' active' : ''}`}
                            onClick={() => {
                              toggleCat(cat.id);
                              selectCategory(group, cat);
                            }}
                          >
                            <IconChevronDown
                              size='small'
                              className='app-docs-toc-caret'
                            />
                            <span>{cat.label}</span>
                          </button>
                          {catOpen &&
                            cat.items.map((item) => (
                              <button
                                type='button'
                                key={item.id}
                                className={`app-docs-toc-link is-sub${activeId === item.id ? ' active' : ''}`}
                                onClick={() => selectItem(group, cat, item)}
                              >
                                <span className='app-docs-toc-link-text'>
                                  {item.label}
                                </span>
                                <MethodTag method={item.method} />
                              </button>
                            ))}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </aside>

        <main className='app-docs-content'>
          <header className='app-docs-hero'>
            <span className='app-docs-badge'>{t('开发者文档')}</span>
            <h1>{t('接入文档')}</h1>
            <p>
              {t(
                '通过统一 API 接入聊天、补全、嵌入、重排序、审查、音频、图像、视频等多模态能力,兼容 OpenAI / Claude / Gemini 格式。下游仅需一个 API 密钥即可调用,无需分别对接各上游厂商。',
              )}
            </p>
            <div className='app-docs-hero-actions'>
              <div className='app-docs-baseurl'>
                <span>base_url</span>
                <code>{serverAddress}</code>
                <button
                  type='button'
                  onClick={async () => {
                    const ok = await copy(serverAddress);
                    if (ok) showSuccess(t('已复制到剪切板'));
                  }}
                >
                  <IconCopy />
                </button>
              </div>
              <button
                type='button'
                className='app-docs-download'
                onClick={() => {
                  if (!activePage) return;
                  const { group, cat } = activePage;
                  const safeName = cat.label.replace(/[\\/:*?"<>|]/g, '_');
                  downloadTextAsFile(
                    buildCategoryMarkdown(serverAddress, group.id, cat.id),
                    `${safeName}.md`,
                  );
                  showSuccess(t('文档已下载'));
                }}
              >
                <IconDownload />
                <span>{t('下载 Markdown')}</span>
              </button>
            </div>
          </header>

          {activePage &&
            (activePage.cat.items ? (
              activePage.cat.items.map((item) => (
                <Section
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
              <Section
                key={activePage.cat.id}
                id={activePage.cat.id}
                title={activePage.cat.label}
                blocks={activePage.cat.blocks}
                setRef={setRef}
              />
            ))}
        </main>
      </div>
    </div>
  );
};

export default Docs;
