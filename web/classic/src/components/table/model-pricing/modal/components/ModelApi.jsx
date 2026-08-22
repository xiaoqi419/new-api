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

import React, { useMemo, useState } from 'react';
import {
  Typography,
  Avatar,
  RadioGroup,
  Radio,
  Select,
  Button,
} from '@douyinfe/semi-ui';
import { Code2, KeyRound, Copy } from 'lucide-react';
import { copy, showSuccess } from '../../../../../helpers';

const { Text } = Typography;

const LANGS = [
  { key: 'curl', label: 'cURL' },
  { key: 'python', label: 'Python' },
  { key: 'typescript', label: 'TypeScript' },
  { key: 'javascript', label: 'JavaScript' },
];

const USER_MESSAGE = 'Explain quantum entanglement in one paragraph.';
const EMBED_TEXT = 'The food was delicious and the waiter…';
const IMAGE_PROMPT = 'A serene koi pond at sunset, ukiyo-e style.';
const API_KEY_ENV = 'NEW_API_KEY';

function buildChatSample(lang, ctx) {
  const url = `${ctx.baseUrl}${ctx.endpointPath}`;
  const isResponses = ctx.endpointType === 'openai-response';
  const isReasoning = /^o[1-4]|reasoning|thinking|deepseek-r/i.test(
    ctx.modelName,
  );
  const bodyJson = isResponses
    ? JSON.stringify({ model: ctx.modelName, input: USER_MESSAGE }, null, 2)
    : JSON.stringify(
        {
          model: ctx.modelName,
          messages: [{ role: 'user', content: USER_MESSAGE }],
          ...(isReasoning ? {} : { temperature: 0.7 }),
        },
        null,
        2,
      );
  const fnCall = isResponses ? 'responses.create' : 'chat.completions.create';

  if (lang === 'curl') {
    return [
      `curl ${url} \\`,
      `  -H "Authorization: Bearer $${API_KEY_ENV}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${bodyJson.replaceAll('\n', '\n     ')}'`,
    ].join('\n');
  }
  if (lang === 'python') {
    return [
      'from openai import OpenAI',
      '',
      'client = OpenAI(',
      `    base_url="${ctx.baseUrl}/v1",`,
      '    api_key="<YOUR_API_KEY>",',
      ')',
      '',
      isResponses
        ? `response = client.${fnCall}(\n    model="${ctx.modelName}",\n    input="${USER_MESSAGE}",\n)\n\nprint(response.output_text)`
        : `completion = client.${fnCall}(\n    model="${ctx.modelName}",\n    messages=[\n        {"role": "user", "content": "${USER_MESSAGE}"}\n    ],\n)\n\nprint(completion.choices[0].message.content)`,
    ].join('\n');
  }
  if (lang === 'typescript') {
    return [
      `import OpenAI from 'openai'`,
      '',
      'const client = new OpenAI({',
      `  baseURL: '${ctx.baseUrl}/v1',`,
      `  apiKey: process.env.${API_KEY_ENV},`,
      '})',
      '',
      isResponses
        ? `const response = await client.${fnCall}({\n  model: '${ctx.modelName}',\n  input: '${USER_MESSAGE}',\n})\n\nconsole.log(response.output_text)`
        : `const completion = await client.${fnCall}({\n  model: '${ctx.modelName}',\n  messages: [{ role: 'user', content: '${USER_MESSAGE}' }],\n})\n\nconsole.log(completion.choices[0].message.content)`,
    ].join('\n');
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    '  headers: {',
    `    Authorization: \`Bearer \${process.env.${API_KEY_ENV}}\`,`,
    `    'Content-Type': 'application/json',`,
    '  },',
    `  body: JSON.stringify(${bodyJson}),`,
    '})',
    '',
    'const data = await response.json()',
    'console.log(data)',
  ].join('\n');
}

function buildAnthropicSample(lang, ctx) {
  const url = `${ctx.baseUrl}${ctx.endpointPath}`;
  if (lang === 'curl') {
    const body = JSON.stringify(
      {
        model: ctx.modelName,
        max_tokens: 1024,
        messages: [{ role: 'user', content: USER_MESSAGE }],
      },
      null,
      2,
    );
    return [
      `curl ${url} \\`,
      `  -H "x-api-key: $${API_KEY_ENV}" \\`,
      `  -H "anthropic-version: 2023-06-01" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${body.replaceAll('\n', '\n     ')}'`,
    ].join('\n');
  }
  if (lang === 'python') {
    return [
      'import anthropic',
      '',
      'client = anthropic.Anthropic(',
      `    base_url="${ctx.baseUrl}",`,
      '    api_key="<YOUR_API_KEY>",',
      ')',
      '',
      'message = client.messages.create(',
      `    model="${ctx.modelName}",`,
      '    max_tokens=1024,',
      `    messages=[{"role": "user", "content": "${USER_MESSAGE}"}],`,
      ')',
      '',
      'print(message.content[0].text)',
    ].join('\n');
  }
  if (lang === 'typescript') {
    return [
      `import Anthropic from '@anthropic-ai/sdk'`,
      '',
      'const client = new Anthropic({',
      `  baseURL: '${ctx.baseUrl}',`,
      `  apiKey: process.env.${API_KEY_ENV},`,
      '})',
      '',
      'const message = await client.messages.create({',
      `  model: '${ctx.modelName}',`,
      '  max_tokens: 1024,',
      `  messages: [{ role: 'user', content: '${USER_MESSAGE}' }],`,
      '})',
      '',
      'console.log(message.content[0].text)',
    ].join('\n');
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    '  headers: {',
    `    'x-api-key': process.env.${API_KEY_ENV},`,
    `    'anthropic-version': '2023-06-01',`,
    `    'Content-Type': 'application/json',`,
    '  },',
    '  body: JSON.stringify({',
    `    model: '${ctx.modelName}',`,
    '    max_tokens: 1024,',
    `    messages: [{ role: 'user', content: '${USER_MESSAGE}' }],`,
    '  }),',
    '})',
    '',
    'const data = await response.json()',
    'console.log(data.content[0].text)',
  ].join('\n');
}

function buildGeminiSample(lang, ctx) {
  const url = `${ctx.baseUrl}${ctx.endpointPath}?key=$${API_KEY_ENV}`;
  if (lang === 'curl') {
    const body = JSON.stringify(
      { contents: [{ parts: [{ text: USER_MESSAGE }] }] },
      null,
      2,
    );
    return [
      `curl '${url}' \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -d '${body.replaceAll('\n', '\n     ')}'`,
    ].join('\n');
  }
  if (lang === 'python') {
    return [
      'import google.generativeai as genai',
      '',
      'genai.configure(api_key="<YOUR_API_KEY>")',
      '',
      `model = genai.GenerativeModel("${ctx.modelName}")`,
      `response = model.generate_content("${USER_MESSAGE}")`,
      '',
      'print(response.text)',
    ].join('\n');
  }
  if (lang === 'typescript') {
    return [
      `import { GoogleGenerativeAI } from '@google/generative-ai'`,
      '',
      `const genAI = new GoogleGenerativeAI(process.env.${API_KEY_ENV})`,
      `const model = genAI.getGenerativeModel({ model: '${ctx.modelName}' })`,
      '',
      `const result = await model.generateContent('${USER_MESSAGE}')`,
      'console.log(result.response.text())',
    ].join('\n');
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: { 'Content-Type': 'application/json' },`,
    '  body: JSON.stringify({',
    `    contents: [{ parts: [{ text: '${USER_MESSAGE}' }] }],`,
    '  }),',
    '})',
    '',
    'const data = await response.json()',
    'console.log(data.candidates[0].content.parts[0].text)',
  ].join('\n');
}

function buildEmbeddingSample(lang, ctx) {
  const url = `${ctx.baseUrl}${ctx.endpointPath}`;
  if (lang === 'curl') {
    const body = JSON.stringify(
      { model: ctx.modelName, input: EMBED_TEXT },
      null,
      2,
    );
    return [
      `curl ${url} \\`,
      `  -H "Authorization: Bearer $${API_KEY_ENV}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${body.replaceAll('\n', '\n     ')}'`,
    ].join('\n');
  }
  if (lang === 'python') {
    return [
      'from openai import OpenAI',
      '',
      `client = OpenAI(base_url="${ctx.baseUrl}/v1", api_key="<YOUR_API_KEY>")`,
      '',
      'response = client.embeddings.create(',
      `    model="${ctx.modelName}",`,
      `    input="${EMBED_TEXT}",`,
      ')',
      '',
      'print(response.data[0].embedding[:8])',
    ].join('\n');
  }
  if (lang === 'typescript') {
    return [
      `import OpenAI from 'openai'`,
      '',
      'const client = new OpenAI({',
      `  baseURL: '${ctx.baseUrl}/v1',`,
      `  apiKey: process.env.${API_KEY_ENV},`,
      '})',
      '',
      'const response = await client.embeddings.create({',
      `  model: '${ctx.modelName}',`,
      `  input: '${EMBED_TEXT}',`,
      '})',
      '',
      'console.log(response.data[0].embedding.slice(0, 8))',
    ].join('\n');
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    '  headers: {',
    `    Authorization: \`Bearer \${process.env.${API_KEY_ENV}}\`,`,
    `    'Content-Type': 'application/json',`,
    '  },',
    '  body: JSON.stringify({',
    `    model: '${ctx.modelName}',`,
    `    input: '${EMBED_TEXT}',`,
    '  }),',
    '})',
    '',
    'const data = await response.json()',
    'console.log(data.data[0].embedding.slice(0, 8))',
  ].join('\n');
}

function buildImageSample(lang, ctx) {
  const url = `${ctx.baseUrl}${ctx.endpointPath}`;
  if (lang === 'curl') {
    const body = JSON.stringify(
      { model: ctx.modelName, prompt: IMAGE_PROMPT, size: '1024x1024', n: 1 },
      null,
      2,
    );
    return [
      `curl ${url} \\`,
      `  -H "Authorization: Bearer $${API_KEY_ENV}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${body.replaceAll('\n', '\n     ')}'`,
    ].join('\n');
  }
  if (lang === 'python') {
    return [
      'from openai import OpenAI',
      '',
      `client = OpenAI(base_url="${ctx.baseUrl}/v1", api_key="<YOUR_API_KEY>")`,
      '',
      'response = client.images.generate(',
      `    model="${ctx.modelName}",`,
      `    prompt="${IMAGE_PROMPT}",`,
      '    size="1024x1024",',
      '    n=1,',
      ')',
      '',
      'print(response.data[0].url)',
    ].join('\n');
  }
  if (lang === 'typescript') {
    return [
      `import OpenAI from 'openai'`,
      '',
      'const client = new OpenAI({',
      `  baseURL: '${ctx.baseUrl}/v1',`,
      `  apiKey: process.env.${API_KEY_ENV},`,
      '})',
      '',
      'const response = await client.images.generate({',
      `  model: '${ctx.modelName}',`,
      `  prompt: '${IMAGE_PROMPT}',`,
      `  size: '1024x1024',`,
      '  n: 1,',
      '})',
      '',
      'console.log(response.data[0].url)',
    ].join('\n');
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    '  headers: {',
    `    Authorization: \`Bearer \${process.env.${API_KEY_ENV}}\`,`,
    `    'Content-Type': 'application/json',`,
    '  },',
    '  body: JSON.stringify({',
    `    model: '${ctx.modelName}',`,
    `    prompt: '${IMAGE_PROMPT}',`,
    `    size: '1024x1024',`,
    '    n: 1,',
    '  }),',
    '})',
    '',
    'const data = await response.json()',
    'console.log(data.data[0].url)',
  ].join('\n');
}

function buildSample(lang, endpointType, ctx) {
  if (endpointType === 'anthropic') return buildAnthropicSample(lang, ctx);
  if (endpointType === 'gemini') return buildGeminiSample(lang, ctx);
  if (endpointType === 'embeddings' || endpointType === 'jina-rerank') {
    return buildEmbeddingSample(lang, ctx);
  }
  if (endpointType === 'image-generation') return buildImageSample(lang, ctx);
  return buildChatSample(lang, ctx);
}

const ModelApi = ({ modelData, endpointMap = {}, serverAddress = '', t }) => {
  const baseUrl = useMemo(() => {
    const candidate = serverAddress || '';
    if (candidate) return candidate.replace(/\/$/, '');
    if (typeof window !== 'undefined') return window.location.origin;
    return 'https://api.example.com';
  }, [serverAddress]);

  const endpoints = useMemo(() => {
    const types = modelData?.supported_endpoint_types || [];
    return types
      .map((type) => {
        const info = endpointMap[type] || {};
        let path = info.path || '';
        if (path && path.includes('{model}')) {
          path = path.replaceAll('{model}', modelData?.model_name || '');
        }
        return { type, path, method: info.method || 'POST' };
      })
      .filter((e) => Boolean(e.path));
  }, [modelData, endpointMap]);

  const [endpointType, setEndpointType] = useState(endpoints[0]?.type ?? '');
  const [lang, setLang] = useState('curl');

  const activeEndpoint = useMemo(
    () => endpoints.find((e) => e.type === endpointType) ?? endpoints[0],
    [endpointType, endpoints],
  );

  if (endpoints.length === 0 || !activeEndpoint) {
    return (
      <div className='flex justify-center items-center py-10'>
        <Text type='secondary'>{t('该模型暂无可用的接口端点')}</Text>
      </div>
    );
  }

  const code = buildSample(lang, activeEndpoint.type, {
    baseUrl,
    modelName: modelData?.model_name || '',
    endpointType: activeEndpoint.type,
    endpointPath: activeEndpoint.path,
  });

  const handleCopy = async () => {
    if (await copy(code)) {
      showSuccess(t('已复制代码'));
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <div className='flex items-center mb-3'>
          <Avatar size='small' color='green' className='mr-2 shadow-md'>
            <Code2 size={16} />
          </Avatar>
          <div>
            <Text className='text-base font-medium'>{t('调用示例')}</Text>
            <div className='text-xs text-gray-600'>
              {t('使用真实端点与模型名生成的请求示例')}
            </div>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-2 mb-2'>
          {endpoints.length > 1 && (
            <Select
              size='small'
              value={endpointType || activeEndpoint.type}
              onChange={(v) => setEndpointType(v)}
              style={{ minWidth: 160 }}
              optionList={endpoints.map((e) => ({
                label: e.type,
                value: e.type,
              }))}
            />
          )}
          <RadioGroup
            type='button'
            buttonSize='small'
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className='ml-auto'
          >
            {LANGS.map((l) => (
              <Radio key={l.key} value={l.key}>
                {l.label}
              </Radio>
            ))}
          </RadioGroup>
        </div>

        <div
          className='relative rounded-xl overflow-hidden'
          style={{ backgroundColor: 'var(--semi-color-fill-0)' }}
        >
          <Button
            size='small'
            theme='borderless'
            type='tertiary'
            icon={<Copy size={12} />}
            onClick={handleCopy}
            className='!absolute top-2 right-2 z-10'
          />
          <pre
            className='m-0 p-3 overflow-auto text-xs leading-relaxed'
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              maxHeight: 360,
            }}
          >
            {code}
          </pre>
        </div>

        <Text type='tertiary' size='small' className='block mt-2'>
          {t('请将 <YOUR_API_KEY> 替换为你在令牌设置中的 API Key。')}
        </Text>
      </div>

      <div>
        <div className='flex items-center mb-2'>
          <Avatar size='small' color='orange' className='mr-2 shadow-md'>
            <KeyRound size={16} />
          </Avatar>
          <div>
            <Text className='text-base font-medium'>{t('鉴权方式')}</Text>
          </div>
        </div>
        <div
          className='rounded-xl border p-3 text-xs leading-relaxed text-gray-600'
          style={{ borderColor: 'var(--semi-color-border)' }}
        >
          <p className='mb-1'>
            {t('所有请求需携带')}{' '}
            <code className='px-1 rounded bg-gray-100'>
              Authorization: Bearer &lt;TOKEN&gt;
            </code>{' '}
            {t('请求头；Anthropic 格式端点改用')}{' '}
            <code className='px-1 rounded bg-gray-100'>x-api-key</code>{' '}
            {t('请求头。')}
          </p>
          <p className='mb-0 text-gray-500'>
            {t('可在令牌页面生成 Token，并限定其可用模型、分组、IP 与速率。')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ModelApi;
