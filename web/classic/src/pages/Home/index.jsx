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

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  Typography,
  Input,
  ScrollList,
  ScrollItem,
} from '@douyinfe/semi-ui';
import { API, showError, copy, showSuccess } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { useFullpage } from '../../hooks/common/useFullpage';
import { API_ENDPOINTS } from '../../constants/common.constant';
import { StatusContext } from '../../context/Status';
import { useActualTheme, useAppearance } from '../../context/Theme';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import {
  IconGithubLogo,
  IconPlay,
  IconFile,
  IconCopy,
  IconArrowRight,
  IconChevronDown,
} from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import NoticeModal from '../../components/layout/NoticeModal';
import { normalizeApimartHomeConfig } from '../../constants/apimartHome';
import {
  Moonshot,
  OpenAI,
  XAI,
  Zhipu,
  Volcengine,
  Cohere,
  Claude,
  Gemini,
  Suno,
  Minimax,
  Wenxin,
  Spark,
  Qingyan,
  DeepSeek,
  Qwen,
  Midjourney,
  Grok,
  AzureAI,
  Hunyuan,
  Xinference,
  ByteDance,
  ChatGLM,
  Kimi,
  Yi,
  Stability,
  Cursor,
  ClaudeCode,
  Codex,
  Cline,
  RooCode,
  KiloCode,
  OpenCode,
  LobeHub,
  OpenWebUI,
  Dify,
} from '@lobehub/icons';

const { Text } = Typography;

const starDots = Array.from({ length: 32 }, (_, index) => index);
const playedTypewriterTexts = new Set();

const TypewriterText = ({
  text,
  delay = 0,
  speed = 48,
  loop = false,
  loopPause = 1400,
  cursor = true,
  className = '',
}) => {
  const fullText = String(text ?? '');
  const chars = useMemo(() => [...fullText], [fullText]);
  const [visibleCount, setVisibleCount] = useState(0);
  const visibleText = chars.slice(0, visibleCount).join('');
  const done = visibleCount >= chars.length;

  useEffect(() => {
    if (!fullText) {
      setVisibleCount(0);
      return undefined;
    }

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      setVisibleCount(chars.length);
      return undefined;
    }

    if (!loop && playedTypewriterTexts.has(fullText)) {
      setVisibleCount(chars.length);
      return undefined;
    }

    setVisibleCount(0);
    let intervalId;
    let loopTimeoutId;
    let cancelled = false;

    const startTyping = () => {
      let nextCount = 0;
      intervalId = window.setInterval(() => {
        if (cancelled) {
          window.clearInterval(intervalId);
          return;
        }

        nextCount += 1;
        setVisibleCount(nextCount);
        if (nextCount >= chars.length) {
          window.clearInterval(intervalId);
          if (loop) {
            loopTimeoutId = window.setTimeout(() => {
              setVisibleCount(0);
              startTyping();
            }, loopPause);
          } else {
            playedTypewriterTexts.add(fullText);
          }
        }
      }, speed);
    };

    const timeoutId = window.setTimeout(() => {
      startTyping();
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (loopTimeoutId) {
        window.clearTimeout(loopTimeoutId);
      }
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [chars.length, delay, fullText, loop, loopPause, speed]);

  return (
    <span
      className={`app-typewriter ${done ? 'done' : ''} ${className}`}
      aria-label={fullText}
    >
      <span className='app-typewriter-measure' aria-hidden='true'>
        {fullText}
      </span>
      <span className='app-typewriter-live' aria-hidden='true'>
        <span>{visibleText}</span>
        {cursor && <span className='app-typewriter-cursor' />}
      </span>
    </span>
  );
};

const renderApimartIcon = (icon, size = 18, name = '') => {
  if (React.isValidElement(icon)) {
    return icon;
  }

  switch (String(icon || '').toLowerCase()) {
    case 'openai':
      return <OpenAI size={size} />;
    case 'claude':
    case 'anthropic':
      return <Claude.Color size={size} />;
    case 'gemini':
    case 'google':
      return <Gemini.Color size={size} />;
    case 'deepseek':
      return <DeepSeek.Color size={size} />;
    case 'qwen':
      return <Qwen.Color size={size} />;
    case 'volcengine':
      return <Volcengine.Color size={size} />;
    case 'bytedance':
      return <ByteDance.Color size={size} />;
    case 'azure':
    case 'azureai':
      return <AzureAI.Color size={size} />;
    case 'midjourney':
      return <Midjourney size={size} />;
    case 'grok':
    case 'xai':
      return <Grok size={size} />;
    case 'minimax':
      return <Minimax.Color size={size} />;
    case 'wenxin':
    case 'baidu':
      return <Wenxin.Color size={size} />;
    case 'spark':
      return <Spark.Color size={size} />;
    case 'zhipu':
      return <Zhipu.Color size={size} />;
    case 'chatglm':
      return <ChatGLM.Color size={size} />;
    case 'moonshot':
    case 'kimi':
      return <Kimi.Color size={size} />;
    case 'yi':
      return <Yi.Color size={size} />;
    case 'suno':
      return <Suno.Color size={size} />;
    case 'stability':
      return <Stability.Color size={size} />;
    case 'cursor':
      return <Cursor size={size} />;
    case 'claudecode':
      return <ClaudeCode size={size} />;
    case 'codex':
      return <Codex size={size} />;
    case 'cline':
      return <Cline size={size} />;
    case 'roocode':
      return <RooCode size={size} />;
    case 'kilocode':
      return <KiloCode size={size} />;
    case 'opencode':
      return <OpenCode size={size} />;
    case 'lobechat':
      return <LobeHub.Color size={size} />;
    case 'openwebui':
      return <OpenWebUI size={size} />;
    case 'dify':
      return <Dify.Color size={size} />;
    default: {
      const initial = String(name || 'AI')
        .replaceAll(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')
        .charAt(0)
        .toUpperCase();
      return (
        <span className='app-home-icon-fallback' style={{ fontSize: size / 2 }}>
          {initial || 'AI'}
        </span>
      );
    }
  }
};

const CODE_KEYWORDS =
  /\b(from|import|as|const|let|var|await|async|new|function|return|print|def|class|if|else|for|in|method|headers|json|true|false|null|None|True|False)\b/;

// 轻量代码高亮：逐行按注释 / 字符串 / 关键字 / 数字着色，无第三方依赖。
const CodeHighlight = ({ code }) => {
  const lines = String(code || '').split('\n');
  const lineOccurrences = new Map();
  return (
    <code className='app-home-code-hl'>
      {lines.map((line) => {
        const occurrence = lineOccurrences.get(line) || 0;
        lineOccurrences.set(line, occurrence + 1);
        const tokens = [];
        let rest = line;
        let guard = 0;
        const commentIdx = (() => {
          const hash = rest.indexOf('#');
          return hash;
        })();
        if (commentIdx >= 0) {
          const before = rest.slice(0, commentIdx);
          const comment = rest.slice(commentIdx);
          pushTokens(before, tokens);
          tokens.push(
            <span className='tok-comment' key='c'>
              {comment}
            </span>,
          );
        } else {
          while (rest.length > 0 && guard < 400) {
            guard += 1;
            const strMatch = rest.match(/^(["'`])(?:\\.|(?!\1).)*\1?/);
            if (strMatch) {
              tokens.push(
                <span className='tok-str' key={tokens.length}>
                  {strMatch[0]}
                </span>,
              );
              rest = rest.slice(strMatch[0].length);
              continue;
            }
            const numMatch = rest.match(/^\b\d+(?:\.\d+)?\b/);
            if (numMatch) {
              tokens.push(
                <span className='tok-num' key={tokens.length}>
                  {numMatch[0]}
                </span>,
              );
              rest = rest.slice(numMatch[0].length);
              continue;
            }
            const wordMatch = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (wordMatch) {
              const w = wordMatch[0];
              tokens.push(
                CODE_KEYWORDS.test(w) ? (
                  <span className='tok-kw' key={tokens.length}>
                    {w}
                  </span>
                ) : (
                  w
                ),
              );
              rest = rest.slice(w.length);
              continue;
            }
            tokens.push(rest[0]);
            rest = rest.slice(1);
          }
        }
        return (
          <span
            className='app-home-code-line'
            key={JSON.stringify([line, occurrence])}
          >
            {tokens}
            {'\n'}
          </span>
        );
      })}
    </code>
  );
};

// 把不含高亮的普通片段按字符串着色（用于注释前的部分）。
function pushTokens(text, tokens) {
  if (text) tokens.push(text);
}

const ApimartHome = ({
  t,
  isMobile,
  systemName,
  serverAddress,
  handleCopyBaseURL,
  docsLink,
  isDemoSiteMode,
  statusState,
}) => {
  const homeConfig = useMemo(
    () => normalizeApimartHomeConfig(statusState?.status?.apimart_home),
    [statusState?.status?.apimart_home],
  );
  const [activeApiName, setActiveApiName] = useState(
    homeConfig.api_use_cases[0]?.name || '',
  );
  const [activeCodeLang, setActiveCodeLang] = useState('Python');
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const {
    hero,
    section_titles: sectionTitles,
    stats,
    featured_models: configuredModels,
    api_use_cases: configuredApiUseCases,
    value_props: configuredValueProps,
    providers,
    clients,
    faq,
  } = homeConfig;
  const activeApi =
    configuredApiUseCases.find((item) => item.name === activeApiName) ||
    configuredApiUseCases[0];
  const sectionIds = ['hero', 'features', 'models', 'use-cases', 'faq', 'cta'];
  const SECTION_COUNT = sectionIds.length;
  const { activeIndex, goTo, setSectionRef } = useFullpage(SECTION_COUNT, true);
  const titlePrefix = systemName === 'New API' ? 'AI API' : systemName;
  const formatHomeText = (text) =>
    t(text || '').replaceAll('{site}', titlePrefix);
  // 标题内空格分隔的中间段用紫粉渐变高亮（参考图关键词高亮效果）。
  const renderHighlightTitle = (text) => {
    const parts = formatHomeText(text).split(' ');
    if (parts.length < 3) return formatHomeText(text);
    const seenParts = new Map();
    return parts.map((part, i) => {
      const occurrence = seenParts.get(part) || 0;
      seenParts.set(part, occurrence + 1);
      return (
        <React.Fragment key={`${part}-${occurrence}`}>
          {i % 2 === 1 ? <em className='app-home-hl'>{part}</em> : part}
          {i < parts.length - 1 ? ' ' : ''}
        </React.Fragment>
      );
    });
  };
  const codeSamples = activeApi?.code_samples || {};
  const codeLangs = Object.keys(codeSamples);
  const activeLang = codeSamples[activeCodeLang]
    ? activeCodeLang
    : codeLangs[0];
  const activeCode = (codeSamples[activeLang] || '').replaceAll(
    '{base}',
    serverAddress,
  );

  useEffect(() => {
    if (!configuredApiUseCases.some((item) => item.name === activeApiName)) {
      setActiveApiName(configuredApiUseCases[0]?.name || '');
    }
  }, [activeApiName, configuredApiUseCases]);

  return (
    <div
      className='app-home-market app-home-fullpage'
      data-active={activeIndex}
    >
      <nav className='app-home-fullpage-nav' aria-label='sections'>
        {sectionIds.map((sectionId, i) => (
          <button
            key={sectionId}
            type='button'
            className={activeIndex === i ? 'active' : ''}
            aria-label={`section ${i + 1}`}
            onClick={() => goTo(i)}
          />
        ))}
      </nav>
      <div
        className='app-home-fullpage-track'
        style={{ transform: `translateY(${-activeIndex * 100}vh)` }}
      >
        <section
          className='app-home-hero app-home-page'
          ref={setSectionRef(0)}
          data-active={activeIndex === 0}
        >
          <div className='app-home-stars' aria-hidden='true'>
            {starDots.map((dot) => (
              <span key={dot} />
            ))}
          </div>

          <div className='app-home-hero-center'>
            <Typography.Title heading={1} className='app-home-title'>
              <TypewriterText
                text={t(hero.title)}
                delay={220}
                speed={58}
                loop
                loopPause={1600}
              />
            </Typography.Title>
            <Text className='app-home-subtitle'>{t(hero.subtitle)}</Text>
            <Text className='app-home-subnote'>{t(hero.subnote)}</Text>

            <div className='app-home-actions'>
              <Link to='/console/token'>
                <Button
                  theme='solid'
                  type='primary'
                  size={isMobile ? 'default' : 'large'}
                  icon={<IconPlay />}
                >
                  {t(hero.primary_button_text)}
                </Button>
              </Link>
              {docsLink ? (
                <Button
                  size={isMobile ? 'default' : 'large'}
                  icon={<IconFile />}
                  onClick={() => window.open(docsLink, '_blank')}
                >
                  {t(hero.secondary_button_text)}
                </Button>
              ) : (
                <Link to='/pricing'>
                  <Button size={isMobile ? 'default' : 'large'}>
                    {t('API 市场')}
                  </Button>
                </Link>
              )}
              {isDemoSiteMode && statusState?.status?.version && (
                <Button
                  size={isMobile ? 'default' : 'large'}
                  icon={<IconGithubLogo />}
                  onClick={() =>
                    window.open(
                      'https://github.com/QuantumNous/new-api',
                      '_blank',
                    )
                  }
                >
                  {statusState.status.version}
                </Button>
              )}
            </div>

            <div className='app-home-stats'>
              {stats.map(({ value, label }, index) => (
                <div className={`tone-${index}`} key={label}>
                  <strong>{value}</strong>
                  <span>{t(label)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className='app-home-section app-home-hot-section app-home-page'
          ref={setSectionRef(1)}
          data-active={activeIndex === 1}
        >
          <div className='app-home-section-heading center'>
            <Typography.Title heading={2}>
              {formatHomeText(sectionTitles.hot_models)}
            </Typography.Title>
          </div>
          <div className='app-home-model-mosaic'>
            {configuredModels.map((model) => (
              <Link
                to={`/console/playground?model=${encodeURIComponent(model.name.replace(' API', ''))}`}
                className={`app-home-model-card ${model.size} tone-${model.tone}`}
                key={model.name}
                style={
                  model.image
                    ? {
                        backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.12) 18%, rgba(0, 0, 0, 0.88) 100%), url(${model.image})`,
                      }
                    : undefined
                }
              >
                <span className='app-home-model-price'>{model.price}</span>
                <div className='app-home-model-brand'>
                  {renderApimartIcon(model.icon, 18)}
                  <small>{model.vendor}</small>
                </div>
                <strong>{model.name}</strong>
              </Link>
            ))}
          </div>
          <Link to='/pricing' className='app-home-center-link'>
            <Button theme='solid' type='primary' icon={<IconArrowRight />}>
              {t('查看所有模型')}
            </Button>
          </Link>
        </section>

        <section
          className='app-home-section app-home-ecosystem-section app-home-page'
          ref={setSectionRef(2)}
          data-active={activeIndex === 2}
        >
          <div className='app-home-eco-block'>
            <div className='app-home-eco-badge'>PROVIDERS</div>
            <div className='app-home-section-heading center'>
              <Typography.Title heading={2}>
                {renderHighlightTitle(sectionTitles.providers)}
              </Typography.Title>
              <Text>{formatHomeText(sectionTitles.providers_subtitle)}</Text>
            </div>
            <div className='app-home-eco-grid'>
              {providers.map(({ name, icon, desc }) => (
                <div className='app-home-eco-card' key={name}>
                  <span className='app-home-eco-icon'>
                    {renderApimartIcon(icon, 30, name)}
                  </span>
                  <div className='app-home-eco-meta'>
                    <strong>{name}</strong>
                    {desc && <small>{desc}</small>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className='app-home-eco-block'>
            <div className='app-home-eco-badge'>CLIENTS</div>
            <div className='app-home-section-heading center'>
              <Typography.Title heading={2}>
                {renderHighlightTitle(sectionTitles.clients)}
              </Typography.Title>
              <Text>{formatHomeText(sectionTitles.clients_subtitle)}</Text>
            </div>
            <div className='app-home-eco-grid'>
              {clients.map(({ name, icon, desc }) => (
                <div className='app-home-eco-card' key={name}>
                  <span className='app-home-eco-icon'>
                    {renderApimartIcon(icon, 30, name)}
                  </span>
                  <div className='app-home-eco-meta'>
                    <strong>{name}</strong>
                    {desc && <small>{desc}</small>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className='app-home-section app-home-api-section app-home-page'
          ref={setSectionRef(3)}
          data-active={activeIndex === 3}
        >
          <div className='app-home-api-showcase'>
            <div className='app-home-api-copy'>
              <div className='app-home-api-tabs'>
                {configuredApiUseCases.map((item) => (
                  <button
                    className={item.name === activeApiName ? 'active' : ''}
                    key={item.name}
                    onClick={() => setActiveApiName(item.name)}
                    type='button'
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <strong>{t(activeApi.title)}</strong>
              <p>{t(activeApi.description)}</p>
              <ul>
                {(activeApi?.bullets || []).map((bullet) => (
                  <li key={bullet}>{t(bullet)}</li>
                ))}
              </ul>
              <div className='app-home-api-baseurl'>
                <span className='app-home-api-baseurl-label'>API Base</span>
                <code>{serverAddress}</code>
                <button onClick={handleCopyBaseURL} type='button'>
                  <IconCopy />
                </button>
              </div>
              <Link to='/pricing'>
                <Button type='primary' theme='solid' icon={<IconArrowRight />}>
                  {t(activeApi?.button || '探索 API')}
                </Button>
              </Link>
            </div>
            <div className='app-home-api-visual'>
              <div className='app-home-code-window'>
                <div className='app-home-code-bar'>
                  <span className='app-home-code-dots'>
                    <i />
                    <i />
                    <i />
                  </span>
                  <div className='app-home-code-langs'>
                    {codeLangs.map((lang) => (
                      <button
                        key={lang}
                        className={lang === activeLang ? 'active' : ''}
                        onClick={() => setActiveCodeLang(lang)}
                        type='button'
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                  <button
                    className='app-home-code-copy'
                    onClick={() =>
                      copy(activeCode).then(
                        (ok) => ok && showSuccess(t('已复制到剪切板')),
                      )
                    }
                    type='button'
                  >
                    <IconCopy /> {t('复制')}
                  </button>
                </div>
                <pre className='app-home-code-body'>
                  <CodeHighlight code={activeCode} />
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section
          className='app-home-section app-home-page'
          ref={setSectionRef(4)}
          data-active={activeIndex === 4}
        >
          <div className='app-home-section-heading center'>
            <Typography.Title heading={2}>
              {formatHomeText(sectionTitles.value_props)}
            </Typography.Title>
          </div>
          <div className='app-home-value-list'>
            {configuredValueProps.map(({ index, title, description }) => (
              <div className='app-home-value-item' key={title}>
                <span>{index}</span>
                <div>
                  <strong>{t(title)}</strong>
                  <p>{t(description)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          className='app-home-section app-home-page'
          ref={setSectionRef(5)}
          data-active={activeIndex === 5}
        >
          <div className='app-home-section-heading center'>
            <Typography.Title heading={2}>
              {formatHomeText(sectionTitles.faq)}
            </Typography.Title>
          </div>
          <div className='app-home-faq'>
            {faq.map(({ question, answer }, index) => (
              <div
                className={`app-home-faq-item ${openFaqIndex === index ? 'open' : ''}`}
                key={question}
              >
                <button
                  onClick={() =>
                    setOpenFaqIndex(openFaqIndex === index ? -1 : index)
                  }
                  type='button'
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{t(question)}</strong>
                  <IconChevronDown />
                </button>
                {openFaqIndex === index && <p>{t(answer)}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

const Home = () => {
  const { t, i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const actualTheme = useActualTheme();
  const appearance = useAppearance();
  const [homePageContentLoaded, setHomePageContentLoaded] = useState(false);
  const [homePageContent, setHomePageContent] = useState('');
  const [noticeVisible, setNoticeVisible] = useState(false);
  const isMobile = useIsMobile();
  const isDemoSiteMode = statusState?.status?.demo_site_enabled || false;
  const docsLink = statusState?.status?.docs_link || '';
  const serverAddress =
    statusState?.status?.server_address || `${window.location.origin}`;
  const endpointItems = API_ENDPOINTS.map((e) => ({ value: e }));
  const [endpointIndex, setEndpointIndex] = useState(0);
  const isChinese = i18n.language.startsWith('zh');
  const systemName =
    statusState?.status?.system_name ||
    localStorage.getItem('system_name') ||
    'New API';
  const isApimartHome = appearance.preset === 'apimart';
  const initialThemeRef = useRef(actualTheme);
  const initialLanguageRef = useRef(i18n.language);

  const displayHomePageContent = useCallback(async () => {
    setHomePageContent(localStorage.getItem('home_page_content') || '');
    const res = await API.get('/api/home_page_content');
    const { success, message, data } = res.data;
    if (success) {
      let content = data;
      if (!data.startsWith('https://')) {
        content = marked.parse(data);
      }
      setHomePageContent(content);
      localStorage.setItem('home_page_content', content);

      // 如果内容是 URL，则发送主题模式
      if (data.startsWith('https://')) {
        const iframe = document.querySelector('iframe');
        if (iframe) {
          iframe.onload = () => {
            iframe.contentWindow.postMessage(
              { themeMode: initialThemeRef.current },
              '*',
            );
            iframe.contentWindow.postMessage(
              { lang: initialLanguageRef.current },
              '*',
            );
          };
        }
      }
    } else {
      showError(message);
      setHomePageContent('加载首页内容失败...');
    }
    setHomePageContentLoaded(true);
  }, []);

  const handleCopyBaseURL = async () => {
    const ok = await copy(serverAddress);
    if (ok) {
      showSuccess(t('已复制到剪切板'));
    }
  };

  useEffect(() => {
    const checkNoticeAndShow = async () => {
      const lastCloseDate = localStorage.getItem('notice_close_date');
      const today = new Date().toDateString();
      if (lastCloseDate !== today) {
        try {
          const res = await API.get('/api/notice');
          const { success, data } = res.data;
          if (success && data && data.trim() !== '') {
            setNoticeVisible(true);
          }
        } catch (error) {
          console.error('获取公告失败:', error);
        }
      }
    };

    checkNoticeAndShow();
  }, []);

  useEffect(() => {
    displayHomePageContent().catch((error) => {
      showError(error.message || '加载首页内容失败...');
      setHomePageContent('加载首页内容失败...');
      setHomePageContentLoaded(true);
    });
  }, [displayHomePageContent]);

  useEffect(() => {
    const timer = setInterval(() => {
      setEndpointIndex((prev) => (prev + 1) % endpointItems.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [endpointItems.length]);

  const shouldShowApimartHome = homePageContentLoaded && isApimartHome;
  const shouldShowDefaultHome =
    homePageContentLoaded && !isApimartHome && homePageContent === '';
  const shouldShowCustomHome =
    !shouldShowApimartHome && !shouldShowDefaultHome;

  return (
    <div className='w-full overflow-x-hidden'>
      <NoticeModal
        visible={noticeVisible}
        onClose={() => setNoticeVisible(false)}
        isMobile={isMobile}
      />
      {shouldShowApimartHome && (
        <ApimartHome
          t={t}
          isMobile={isMobile}
          systemName={systemName}
          serverAddress={serverAddress}
          handleCopyBaseURL={handleCopyBaseURL}
          docsLink={docsLink}
          isDemoSiteMode={isDemoSiteMode}
          statusState={statusState}
        />
      )}
      {shouldShowDefaultHome && (
        <div className='w-full overflow-x-hidden'>
          {/* Banner 部分 */}
          <div className='w-full border-b border-semi-color-border min-h-[500px] md:min-h-[600px] lg:min-h-[700px] relative overflow-x-hidden'>
            {/* 背景模糊晕染球 */}
            <div className='blur-ball blur-ball-indigo' />
            <div className='blur-ball blur-ball-teal' />
            <div className='flex items-center justify-center h-full px-4 py-20 md:py-24 lg:py-32 mt-10'>
              {/* 居中内容区 */}
              <div className='flex flex-col items-center justify-center text-center max-w-4xl mx-auto'>
                <div className='flex flex-col items-center justify-center mb-6 md:mb-8'>
                  <h1
                    className={`text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-semi-color-text-0 leading-tight ${isChinese ? 'tracking-wide md:tracking-wider' : ''}`}
                  >
                    {t('统一的')}
                    <br />
                    <span className='shine-text'>{t('大模型接口网关')}</span>
                  </h1>
                  <p className='text-base md:text-lg lg:text-xl text-semi-color-text-1 mt-4 md:mt-6 max-w-xl'>
                    {t('更好的价格，更好的稳定性，只需要将模型基址替换为：')}
                  </p>
                  {/* BASE URL 与端点选择 */}
                  <div className='flex flex-col md:flex-row items-center justify-center gap-4 w-full mt-4 md:mt-6 max-w-md'>
                    <Input
                      readOnly
                      value={serverAddress}
                      className='flex-1 !rounded-full'
                      size={isMobile ? 'default' : 'large'}
                      suffix={
                        <div className='flex items-center gap-2'>
                          <ScrollList
                            bodyHeight={32}
                            style={{ border: 'unset', boxShadow: 'unset' }}
                          >
                            <ScrollItem
                              mode='wheel'
                              cycled={true}
                              list={endpointItems}
                              selectedIndex={endpointIndex}
                              onSelect={({ index }) => setEndpointIndex(index)}
                            />
                          </ScrollList>
                          <Button
                            type='primary'
                            onClick={handleCopyBaseURL}
                            icon={<IconCopy />}
                            className='!rounded-full'
                          />
                        </div>
                      }
                    />
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className='flex flex-row gap-4 justify-center items-center'>
                  <Link to='/console'>
                    <Button
                      theme='solid'
                      type='primary'
                      size={isMobile ? 'default' : 'large'}
                      className='!rounded-3xl px-8 py-2'
                      icon={<IconPlay />}
                    >
                      {t('获取密钥')}
                    </Button>
                  </Link>
                  {isDemoSiteMode && statusState?.status?.version ? (
                    <Button
                      size={isMobile ? 'default' : 'large'}
                      className='flex items-center !rounded-3xl px-6 py-2'
                      icon={<IconGithubLogo />}
                      onClick={() =>
                        window.open(
                          'https://github.com/QuantumNous/new-api',
                          '_blank',
                        )
                      }
                    >
                      {statusState.status.version}
                    </Button>
                  ) : (
                    docsLink && (
                      <Button
                        size={isMobile ? 'default' : 'large'}
                        className='flex items-center !rounded-3xl px-6 py-2'
                        icon={<IconFile />}
                        onClick={() => window.open(docsLink, '_blank')}
                      >
                        {t('文档')}
                      </Button>
                    )
                  )}
                </div>

                {/* 框架兼容性图标 */}
                <div className='mt-12 md:mt-16 lg:mt-20 w-full'>
                  <div className='flex items-center mb-6 md:mb-8 justify-center'>
                    <Text
                      type='tertiary'
                      className='text-lg md:text-xl lg:text-2xl font-light'
                    >
                      {t('支持众多的大模型供应商')}
                    </Text>
                  </div>
                  <div className='flex flex-wrap items-center justify-center gap-3 sm:gap-4 md:gap-6 lg:gap-8 max-w-5xl mx-auto px-4'>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Moonshot size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <OpenAI size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <XAI size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Zhipu.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Volcengine.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Cohere.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Claude.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Gemini.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Suno size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Minimax.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Wenxin.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Spark.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Qingyan.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <DeepSeek.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Qwen.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Midjourney size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Grok size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <AzureAI.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Hunyuan.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Xinference.Color size={40} />
                    </div>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center'>
                      <Typography.Text className='!text-lg sm:!text-xl md:!text-2xl lg:!text-3xl font-bold'>
                        30+
                      </Typography.Text>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {shouldShowCustomHome && (
        <div className='overflow-x-hidden w-full'>
          {homePageContent.startsWith('https://') ? (
            <iframe
              src={homePageContent}
              className='w-full h-screen border-none'
            />
          ) : (
            <div
              className='mt-[60px]'
              dangerouslySetInnerHTML={{ __html: homePageContent }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Home;
