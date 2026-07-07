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

import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Typography,
  Input,
  ScrollList,
  ScrollItem,
} from '@douyinfe/semi-ui';
import { API, showError, copy, showSuccess } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
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
  const chars = useMemo(() => Array.from(fullText), [fullText]);
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

const renderApimartIcon = (icon, size = 18) => {
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
    case 'bytedance':
      return <Volcengine.Color size={size} />;
    case 'azure':
    case 'azureai':
      return <AzureAI.Color size={size} />;
    case 'midjourney':
      return <Midjourney size={size} />;
    case 'grok':
      return <Grok size={size} />;
    case 'minimax':
      return <Minimax.Color size={size} />;
    case 'wenxin':
      return <Wenxin.Color size={size} />;
    case 'spark':
      return <Spark.Color size={size} />;
    default:
      return <span className='app-home-icon-fallback'>AI</span>;
  }
};

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
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const {
    hero,
    section_titles: sectionTitles,
    stats,
    featured_models: configuredModels,
    steps,
    api_use_cases: configuredApiUseCases,
    value_props: configuredValueProps,
    providers,
    faq,
  } = homeConfig;
  const activeApi =
    configuredApiUseCases.find((item) => item.name === activeApiName) ||
    configuredApiUseCases[0];
  const titlePrefix = systemName === 'New API' ? 'AI API' : systemName;
  const formatHomeText = (text) =>
    t(text || '').replaceAll('{site}', titlePrefix);

  useEffect(() => {
    if (!configuredApiUseCases.some((item) => item.name === activeApiName)) {
      setActiveApiName(configuredApiUseCases[0]?.name || '');
    }
  }, [activeApiName, configuredApiUseCases]);

  return (
    <div className='app-home-market'>
      <section className='app-home-hero'>
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

      <section className='app-home-section app-home-hot-section'>
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

      <section className='app-home-section app-home-steps-section'>
        <div className='app-home-section-heading center'>
          <Typography.Title heading={2}>
            {formatHomeText(sectionTitles.steps)}
          </Typography.Title>
          <Text>{formatHomeText(sectionTitles.steps_subtitle)}</Text>
        </div>
        <div className='app-home-step-track'>
          {steps.map((item) => (
            <div className='app-home-step' key={item.step}>
              <span>{item.step}</span>
              <strong>{t(item.title)}</strong>
              <p>{t(item.description)}</p>
            </div>
          ))}
        </div>
        <div className='app-home-actions app-home-section-actions'>
          <Link to='/console/token'>
            <Button theme='solid' type='primary' icon={<IconArrowRight />}>
              {t('获取 API 密钥')}
            </Button>
          </Link>
          {docsLink && (
            <Button icon={<IconFile />} onClick={() => window.open(docsLink)}>
              {t('查看文档')}
            </Button>
          )}
        </div>
      </section>

      <section className='app-home-section app-home-api-section'>
        <div className='app-home-section-heading center'>
          <Typography.Title heading={2}>
            {formatHomeText(sectionTitles.api_use_cases)}
          </Typography.Title>
        </div>
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
        <div className='app-home-api-showcase'>
          <div className='app-home-api-copy'>
            <span>{activeApi.name}</span>
            <strong>{t(activeApi.title)}</strong>
            <p>{t(activeApi.description)}</p>
            <ul>
              {(activeApi?.bullets || []).map((bullet) => (
                <li key={bullet}>{t(bullet)}</li>
              ))}
            </ul>
            <Link to='/pricing'>
              <Button type='primary' theme='solid' icon={<IconArrowRight />}>
                {t(activeApi?.button || '探索 API')}
              </Button>
            </Link>
          </div>
          <div className='app-home-api-visual'>
            <img src={activeApi?.image || '/cover-4.webp'} alt='' />
            <div className='app-home-chat-card'>
              <div>
                <span>ChatAI</span>
                <strong>How can I help you?</strong>
              </div>
              <p>{`base_url: ${serverAddress}`}</p>
              <button onClick={handleCopyBaseURL} type='button'>
                <IconCopy /> {t('复制 Base URL')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className='app-home-section'>
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

      <section className='app-home-section app-home-provider-section'>
        <div className='app-home-section-heading center'>
          <Typography.Title heading={2}>
            {formatHomeText(sectionTitles.providers)}
          </Typography.Title>
        </div>
        <div className='app-home-provider-marquee'>
          <div className='app-home-provider-track'>
            {[...providers, ...providers].map(({ name, icon }, index) => (
              <div className='app-home-provider-logo' key={`${name}-${index}`}>
                {renderApimartIcon(icon, 34)}
                <span>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className='app-home-section'>
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

  const displayHomePageContent = async () => {
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
            iframe.contentWindow.postMessage({ themeMode: actualTheme }, '*');
            iframe.contentWindow.postMessage({ lang: i18n.language }, '*');
          };
        }
      }
    } else {
      showError(message);
      setHomePageContent('加载首页内容失败...');
    }
    setHomePageContentLoaded(true);
  };

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
    displayHomePageContent().then();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setEndpointIndex((prev) => (prev + 1) % endpointItems.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [endpointItems.length]);

  return (
    <div className='w-full overflow-x-hidden'>
      <NoticeModal
        visible={noticeVisible}
        onClose={() => setNoticeVisible(false)}
        isMobile={isMobile}
      />
      {homePageContentLoaded && isApimartHome ? (
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
      ) : homePageContentLoaded && homePageContent === '' ? (
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
                    <>
                      {t('统一的')}
                      <br />
                      <span className='shine-text'>{t('大模型接口网关')}</span>
                    </>
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
      ) : (
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
