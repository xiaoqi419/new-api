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
    providers: '一把 Key 接入 全球 30+ AI 厂商',
    providers_subtitle:
      '文本对话、图像生成、视频合成、语音 TTS/STT、Embedding，海内外主流模型全部覆盖，按 token 计费透明可追溯。',
    clients: '在 你喜欢的工具 里直接使用',
    clients_subtitle:
      '所有支持 OpenAI / Anthropic / Gemini 协议的客户端、IDE 插件、AI 代理与 Web UI 都可以直接填入我们的 base URL 和 API Key。',
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
      code_samples: {
        Python: `from openai import OpenAI

client = OpenAI(
    base_url="{base}/v1",
    api_key="YOUR_API_KEY",
)

resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)`,
        'Node.js': `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "{base}/v1",
  apiKey: "YOUR_API_KEY",
});

const resp = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "你好" }],
});
console.log(resp.choices[0].message.content);`,
        cURL: `curl {base}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "你好"}]
  }'`,
      },
    },
    {
      name: 'Image API',
      title: '图像API - 接入主流图像生成能力',
      description:
        '统一管理图像生成渠道，用同一套账户、密钥和计费体系服务创意生产场景。',
      bullets: ['统一任务提交和结果查询', '支持多渠道成本和可用性切换'],
      button: '探索图像 API',
      image: '/cover-2.webp',
      code_samples: {
        Python: `from openai import OpenAI

client = OpenAI(
    base_url="{base}/v1",
    api_key="YOUR_API_KEY",
)

img = client.images.generate(
    model="gpt-image-1",
    prompt="a cute cat astronaut",
    size="1024x1024",
)
print(img.data[0].url)`,
        'Node.js': `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "{base}/v1",
  apiKey: "YOUR_API_KEY",
});

const img = await client.images.generate({
  model: "gpt-image-1",
  prompt: "a cute cat astronaut",
  size: "1024x1024",
});
console.log(img.data[0].url);`,
        cURL: `curl {base}/v1/images/generations \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-1",
    "prompt": "a cute cat astronaut",
    "size": "1024x1024"
  }'`,
      },
    },
    {
      name: 'Video API',
      title: '视频API - 管理异步生成任务',
      description:
        '把视频生成、任务状态、结果预览和额度消耗放进同一套控制台流程。',
      bullets: ['适配异步任务工作流', '日志、额度和失败原因集中追踪'],
      button: '探索视频 API',
      image: '/cover-3.webp',
      code_samples: {
        Python: `import requests

resp = requests.post(
    "{base}/v1/video/generations",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "sora-2",
        "prompt": "a timelapse of a blooming flower",
    },
)
print(resp.json())`,
        'Node.js': `const resp = await fetch("{base}/v1/video/generations", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "sora-2",
    prompt: "a timelapse of a blooming flower",
  }),
});
console.log(await resp.json());`,
        cURL: `curl {base}/v1/video/generations \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "sora-2",
    "prompt": "a timelapse of a blooming flower"
  }'`,
      },
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
    { name: 'OpenAI', icon: 'openai', desc: '文本 · 图像 · 语音' },
    { name: 'Anthropic', icon: 'claude', desc: '文本 · 代码' },
    { name: 'Google Gemini', icon: 'gemini', desc: '文本 · 视觉 · 多模态' },
    { name: 'xAI Grok', icon: 'grok', desc: '文本 · 推理' },
    { name: 'DeepSeek', icon: 'deepseek', desc: '文本 · 推理' },
    { name: '智谱 GLM', icon: 'zhipu', desc: '文本 · 多模态' },
    { name: '阿里通义千问', icon: 'qwen', desc: '文本 · 代码 · 长文' },
    { name: '月之暗面 Kimi', icon: 'moonshot', desc: '文本 · 长上下文' },
    { name: '豆包 / 火山方舟', icon: 'volcengine', desc: '文本 · 多模态' },
    { name: '百度文心', icon: 'wenxin', desc: '文本 · 多模态' },
    { name: '字节跳动', icon: 'bytedance', desc: '视频 · 图像' },
    { name: 'MiniMax', icon: 'minimax', desc: '文本 · 音频' },
    { name: 'ChatGLM', icon: 'chatglm', desc: '文本 · 智能体' },
    { name: '零一万物', icon: 'yi', desc: '文本' },
    { name: 'Midjourney', icon: 'midjourney', desc: '图像生成' },
    { name: 'Suno', icon: 'suno', desc: '音乐生成' },
    { name: 'Stability AI', icon: 'stability', desc: '图像生成' },
  ],
  clients: [
    { name: 'Cursor', icon: 'cursor', desc: 'AI 编程 IDE' },
    { name: 'Claude Code', icon: 'claudecode', desc: '终端 AI 代理' },
    { name: 'Codex CLI', icon: 'codex', desc: 'OpenAI 终端代理' },
    { name: 'Cline', icon: 'cline', desc: 'VS Code AI 助手' },
    { name: 'Roo Code', icon: 'roocode', desc: 'VS Code Fork' },
    { name: 'Kilo Code', icon: 'kilocode', desc: 'VS Code 代理' },
    { name: 'OpenCode', icon: 'opencode', desc: '开放 AI IDE' },
    { name: 'Cherry Studio', icon: 'cherry', desc: '跨平台客户端' },
    { name: 'LobeChat', icon: 'lobechat', desc: 'AI 助手界面' },
    { name: 'Open WebUI', icon: 'openwebui', desc: '自托管 Web UI' },
    { name: 'Dify', icon: 'dify', desc: 'AI 应用编排' },
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

// 后端存储的 api_use_cases 可能缺少新增的 code_samples 字段（旧配置），
// 此处按 name 匹配默认项补齐多语言代码示例，保证代码窗口始终有内容。
const mergeApiUseCases = (configList) => {
  const list = ensureArray(configList, defaultApimartHomeConfig.api_use_cases);
  return list.map((item) => {
    const hasSamples =
      item && item.code_samples && Object.keys(item.code_samples).length > 0;
    if (hasSamples) return item;
    const fallback =
      defaultApimartHomeConfig.api_use_cases.find(
        (d) => d.name === item?.name,
      ) || {};
    return {
      ...item,
      code_samples:
        fallback.code_samples ||
        defaultApimartHomeConfig.api_use_cases[0].code_samples,
    };
  });
};

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
    api_use_cases: mergeApiUseCases(config.api_use_cases),
    value_props: ensureArray(
      config.value_props,
      defaultApimartHomeConfig.value_props,
    ),
    providers: ensureArray(
      config.providers,
      defaultApimartHomeConfig.providers,
    ),
    clients: ensureArray(config.clients, defaultApimartHomeConfig.clients),
    faq: ensureArray(config.faq, defaultApimartHomeConfig.faq),
  };
};
