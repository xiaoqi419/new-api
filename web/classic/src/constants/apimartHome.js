export const defaultApimartHomeConfig = {
  hero: {
    title: '统一 AI API 折扣聚合平台',
    subtitle: '一个 API 满足所有需求 · 节省 30-70%',
    subnote: '一个端点 · 百种模型 · 无限可能',
    primary_button_text: '获取 API 密钥',
    secondary_button_text: 'API 文档',
  },
  section_titles: {
    hot_models: '热门 AI API 模型',
    steps: '3 个简单步骤集成 {site} API',
    steps_subtitle: '几分钟内即可开始使用数百种 AI 模型',
    api_use_cases: '适合任何项目的 API',
    value_props: '为什么选择 {site} 作为您的 AI API 平台',
    providers: '所有模型均可使用',
    faq: '常见问题',
  },
  stats: [
    { value: '100+', label: 'AI模型' },
    { value: '99.9%', label: '在线率' },
    { value: '<50ms', label: '全球延迟' },
    { value: '70%', label: '成本节省' },
  ],
  featured_models: [
    {
      name: 'Nano Banana 2 API',
      vendor: 'Gemini',
      price: '$0.025',
      size: 'small',
      tone: 'cyan',
      icon: 'gemini',
      image: '',
    },
    {
      name: 'Seedream 5.0 Lite API',
      vendor: 'ByteDance',
      price: '$0.025',
      size: 'small',
      tone: 'blue',
      icon: 'volcengine',
      image: '',
    },
    {
      name: 'SkyReels V4 API',
      vendor: 'SkyReels',
      price: 'Coming Soon',
      size: 'wide',
      tone: 'green',
      icon: 'spark',
      image: '',
    },
    {
      name: 'Seedream 4.5 API',
      vendor: 'ByteDance',
      price: '$0.025',
      size: 'small',
      tone: 'teal',
      icon: 'volcengine',
      image: '',
    },
    {
      name: 'Sora 2 API',
      vendor: 'OpenAI',
      price: '$0.025',
      size: 'small',
      tone: 'orange',
      icon: 'openai',
      image: '',
    },
    {
      name: 'Sora 2 Pro API',
      vendor: 'OpenAI',
      price: '$1',
      size: 'large',
      tone: 'violet',
      icon: 'openai',
      image: '',
    },
    {
      name: 'Veo 3.1 API',
      vendor: 'Google',
      price: '$0.08',
      size: 'large',
      tone: 'pink',
      icon: 'gemini',
      image: '',
    },
  ],
  steps: [
    {
      step: '01',
      title: '创建 API 密钥',
      description: '注册账户，在控制台生成专属 API 密钥。',
    },
    {
      step: '02',
      title: '更新 Base URL',
      description: 'OpenAI SDK 用户只需要替换接口地址。',
    },
    {
      step: '03',
      title: '开始使用 AI 模型',
      description: '通过统一接口调用 GPT、Claude、Sora 等模型。',
    },
  ],
  api_use_cases: [
    {
      name: 'Chat API',
      title: 'AI聊天API - 访问100+领先的语言模型',
      description:
        '通过一个 API 访问 GPT、Claude、DeepSeek、Qwen 等主流聊天模型，保持 OpenAI 兼容请求格式。',
      bullets: ['统一鉴权、计费和日志', '支持流式输出、视觉输入和工具调用'],
      button: '探索聊天 API',
      image: '/cover-4.webp',
    },
    {
      name: 'Image API',
      title: '图像API - 接入主流图像生成能力',
      description:
        '统一管理图像生成渠道，用同一套账户、密钥和计费体系服务创意生产场景。',
      bullets: ['统一任务提交和结果查询', '支持多渠道成本和可用性切换'],
      button: '探索图像 API',
      image: '/cover-2.webp',
    },
    {
      name: 'Video API',
      title: '视频API - 管理异步生成任务',
      description:
        '把视频生成、任务状态、结果预览和额度消耗放进同一套控制台流程。',
      bullets: ['适配异步任务工作流', '日志、额度和失败原因集中追踪'],
      button: '探索视频 API',
      image: '/cover-3.webp',
    },
  ],
  value_props: [
    {
      index: '01',
      title: '成本低于竞争对手',
      description: '对接多家上游渠道，按模型和场景选择更低成本路径。',
    },
    {
      index: '02',
      title: '100+ AI模型，一个API',
      description: '聊天、图像、视频、嵌入和重排模型都走同一套接入方式。',
    },
    {
      index: '03',
      title: 'OpenAI兼容格式',
      description: '现有 OpenAI SDK 只需替换 Base URL 和 API Key。',
    },
    {
      index: '04',
      title: '高性能与可靠性',
      description: '渠道健康检查、优先级、权重和自动禁用机制保障可用性。',
    },
    {
      index: '05',
      title: '开发友好的文档',
      description: '统一接口、日志和控制台让接入、排障、计费更清晰。',
    },
    {
      index: '06',
      title: '灵活凭证与计费',
      description: '支持令牌、分组、额度、订阅、充值、兑换码和倍率策略。',
    },
  ],
  providers: [
    { name: 'ANTHROPIC', icon: 'claude' },
    { name: 'OpenAI', icon: 'openai' },
    { name: 'Google', icon: 'gemini' },
    { name: 'DeepSeek', icon: 'deepseek' },
    { name: 'Qwen', icon: 'qwen' },
    { name: 'ByteDance', icon: 'volcengine' },
    { name: 'Azure AI', icon: 'azure' },
    { name: 'Midjourney', icon: 'midjourney' },
    { name: 'Grok', icon: 'grok' },
    { name: 'MiniMax', icon: 'minimax' },
    { name: 'Wenxin', icon: 'wenxin' },
    { name: 'Spark', icon: 'spark' },
  ],
  faq: [
    {
      question: '什么是 AI API 聚合平台？',
      answer:
        '它把多家模型供应商接入到统一 API 中，开发者用一个密钥和一个 Base URL 访问多种模型。',
    },
    {
      question: '新手能快速接入吗？',
      answer: '可以。创建密钥、替换 Base URL、选择模型后即可开始调用。',
    },
    {
      question: '与 OpenAI API 兼容性如何？',
      answer: '聊天接口保持 OpenAI 兼容格式，现有 SDK 迁移成本较低。',
    },
    {
      question: '如何接入到我的应用中？',
      answer:
        '在应用里配置平台提供的 API Key 和 Base URL，然后按模型名称发起请求。',
    },
    {
      question: '相比直接使用模型供应商，为什么选择聚合平台？',
      answer:
        '聚合平台能统一管理模型、密钥、额度、日志和渠道容灾，降低接入与运维成本。',
    },
    {
      question: '我的 API Key 安全吗？',
      answer:
        '密钥由系统统一管理，管理员可配置用户权限、模型限制、额度和访问策略。',
    },
  ],
};

export const modelSizeOptions = [
  { label: '小卡片', value: 'small' },
  { label: '宽卡片', value: 'wide' },
  { label: '大卡片', value: 'large' },
];

export const modelToneOptions = [
  { label: '青色', value: 'cyan' },
  { label: '蓝色', value: 'blue' },
  { label: '绿色', value: 'green' },
  { label: '蓝绿', value: 'teal' },
  { label: '橙色', value: 'orange' },
  { label: '紫色', value: 'violet' },
  { label: '粉色', value: 'pink' },
];

export const providerIconOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Claude', value: 'claude' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'Qwen', value: 'qwen' },
  { label: 'Volcengine', value: 'volcengine' },
  { label: 'Azure AI', value: 'azure' },
  { label: 'Midjourney', value: 'midjourney' },
  { label: 'Grok', value: 'grok' },
  { label: 'MiniMax', value: 'minimax' },
  { label: 'Wenxin', value: 'wenxin' },
  { label: 'Spark', value: 'spark' },
];

const ensureArray = (value, fallback) =>
  Array.isArray(value) && value.length > 0 ? value : fallback;

export const normalizeApimartHomeConfig = (value) => {
  let config = value || {};
  if (typeof config === 'string') {
    try {
      config = JSON.parse(config);
    } catch {
      config = {};
    }
  }

  return {
    hero: {
      ...defaultApimartHomeConfig.hero,
      ...(config.hero || {}),
    },
    section_titles: {
      ...defaultApimartHomeConfig.section_titles,
      ...(config.section_titles || {}),
    },
    stats: ensureArray(config.stats, defaultApimartHomeConfig.stats),
    featured_models: ensureArray(
      config.featured_models,
      defaultApimartHomeConfig.featured_models,
    ),
    steps: ensureArray(config.steps, defaultApimartHomeConfig.steps),
    api_use_cases: ensureArray(
      config.api_use_cases,
      defaultApimartHomeConfig.api_use_cases,
    ),
    value_props: ensureArray(
      config.value_props,
      defaultApimartHomeConfig.value_props,
    ),
    providers: ensureArray(
      config.providers,
      defaultApimartHomeConfig.providers,
    ),
    faq: ensureArray(config.faq, defaultApimartHomeConfig.faq),
  };
};
