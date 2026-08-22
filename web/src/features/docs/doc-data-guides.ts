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

// Bilingual (zh / en) content for the guide, tool-integration and FAQ groups of
// the 接入文档 (Docs) page. All request base URLs are derived from `baseUrl`
// (the backend-configured server address), never hardcoded to a specific host.

import type { DocGroup, DocLang } from './doc-data'

type Pick = (cn: string, en: string) => string

const makePick =
  (lang: DocLang): Pick =>
  (cn, en) =>
    lang === 'zh' ? cn : en

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

export const buildGuidesGroup = (baseUrl: string, lang: DocLang): DocGroup => {
  const p = makePick(lang)
  return {
    id: 'guides',
    superLabel: p('指南', 'Guides'),
    categories: [
      {
        id: 'quickstart',
        label: p('快速开始', 'Quick Start'),
        blocks: [
          {
            kind: 'p',
            text: p(
              '只需三步即可接入:创建令牌、选择兼容协议、发起第一个请求。全站以 **OpenAI / Claude / Gemini 兼容格式** 分发,一个令牌即可调用全部模型。',
              'Get started in three steps: create a token, pick a compatible protocol, and send your first request. Everything is served in **OpenAI / Claude / Gemini compatible formats**, and a single token can call every model.'
            ),
          },
          { kind: 'h3', text: p('第一步:创建令牌', 'Step 1 — Create a token') },
          {
            kind: 'p',
            text: p(
              '登录后进入 **控制台 → 令牌管理**,点击「添加令牌」,创建后复制以 `sk-` 开头的密钥并妥善保存。',
              'After signing in, go to **Console → API Tokens**, click "Add Token", then copy and safely store the key (it starts with `sk-`).'
            ),
          },
          {
            kind: 'h3',
            text: p('第二步:选择接入协议', 'Step 2 — Choose a protocol'),
          },
          {
            kind: 'p',
            text: p(
              '请求基地址(base_url)即本站服务器地址:',
              'The request base URL (base_url) is this site’s server address:'
            ),
          },
          { kind: 'code', label: 'base_url', code: baseUrl },
          {
            kind: 'table',
            head: [
              p('协议', 'Protocol'),
              'base_url',
              p('典型端点', 'Typical endpoint'),
            ],
            rows: [
              ['OpenAI', `\`${baseUrl}/v1\``, '`/v1/chat/completions`'],
              ['Anthropic Claude', `\`${baseUrl}\``, '`/v1/messages`'],
              [
                'Google Gemini',
                `\`${baseUrl}\``,
                '`/v1beta/models/{model}:generateContent`',
              ],
            ],
          },
          {
            kind: 'h3',
            text: p(
              '第三步:发起第一个请求',
              'Step 3 — Send your first request'
            ),
          },
          {
            kind: 'code',
            label: 'cURL',
            code: `curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Authorization: Bearer sk-xxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{ "role": "user", "content": "Hello!" }]
  }'`,
          },
          {
            kind: 'code',
            label: 'Python',
            code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-xxxxxx",
    base_url="${baseUrl}/v1",
)

resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)`,
          },
          {
            kind: 'code',
            label: 'Node.js',
            code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-xxxxxx",
  baseURL: "${baseUrl}/v1",
});

const resp = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(resp.choices[0].message.content);`,
          },
          {
            kind: 'h3',
            text: p('使用 Claude 协议', 'Using the Claude protocol'),
          },
          {
            kind: 'p',
            text: p(
              '如果你使用 Claude Code、Cursor 等基于 Anthropic SDK 的工具,可直接调用 Claude 兼容端点(注意本站 Claude 端点位于 `/v1/messages`):',
              'If you use Claude Code, Cursor, or other Anthropic-SDK based tools, call the Claude-compatible endpoint directly (note this site serves Claude at `/v1/messages`):'
            ),
          },
          {
            kind: 'code',
            label: 'cURL',
            code: `curl -X POST "${baseUrl}/v1/messages" \\
  -H "Authorization: Bearer sk-xxxxxx" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-3-5-sonnet",
    "max_tokens": 1024,
    "messages": [{ "role": "user", "content": "Hello!" }]
  }'`,
          },
          {
            kind: 'note',
            text: p(
              '令牌可用的模型与分组在 **控制台 → 令牌管理** 中配置;可调用的模型清单以「模型广场」为准。',
              'A token’s available models and group are configured in **Console → API Tokens**; the callable model list follows the "Model Square".'
            ),
          },
        ],
      },
      {
        id: 'groups-routing',
        label: p('分组与路由', 'Groups & Routing'),
        blocks: [
          {
            kind: 'p',
            text: p(
              '每个模型可能由**多个上游渠道**承载。平台用**分组(group)**来组织这些渠道:令牌绑定到某个分组后,请求会在该分组下的可用渠道之间自动选择与重试。',
              'Each model may be backed by **multiple upstream channels**. The platform organizes them with **groups**: once a token is bound to a group, requests are automatically routed and retried across the available channels in that group.'
            ),
          },
          {
            kind: 'list',
            items: [
              p(
                '**自动故障转移**:某个渠道失败或超时,系统会自动切换到同分组下的其它渠道,对你的代码透明。',
                '**Automatic failover**: if a channel fails or times out, the system switches to another channel in the same group, transparently to your code.'
              ),
              p(
                '**分组倍率**:不同分组有不同的价格倍率,最终价格 = 模型基础价 × 分组倍率。',
                '**Group multiplier**: different groups carry different price multipliers; the final price = model base price × group multiplier.'
              ),
              p(
                '**权限隔离**:不同分组可开放不同的模型范围,由管理员在后台配置。',
                '**Access isolation**: different groups may expose different model ranges, configured by the admin.'
              ),
            ],
          },
          {
            kind: 'p',
            text: p(
              '在 **控制台 → 令牌管理** 创建 / 编辑令牌时选择分组即可。可用分组、倍率与模型范围以控制台实际显示为准。',
              'Pick a group when creating or editing a token in **Console → API Tokens**. The available groups, multipliers and model ranges follow what the console actually shows.'
            ),
          },
          {
            kind: 'note',
            text: p(
              '每次调用的实际消耗与倍率可在 **控制台 → 日志** 中查看。',
              'The actual usage and multiplier of each call can be reviewed in **Console → Logs**.'
            ),
          },
        ],
      },
      {
        id: 'rate-limits',
        label: p('速率限制', 'Rate Limits'),
        blocks: [
          {
            kind: 'p',
            text: p(
              '为保障服务稳定与资源公平分配,平台按模型 / 分组对请求施加速率限制。常见维度:',
              'To keep the service stable and share resources fairly, the platform applies rate limits per model / group. Common dimensions:'
            ),
          },
          {
            kind: 'table',
            head: [p('维度', 'Dimension'), p('含义', 'Meaning')],
            rows: [
              ['RPM', p('每分钟请求数', 'Requests per minute')],
              [
                'TPM',
                p(
                  '每分钟 token 数(输入 + 输出)',
                  'Tokens per minute (input + output)'
                ),
              ],
              ['RPD', p('每日请求数', 'Requests per day')],
            ],
          },
          {
            kind: 'p',
            text: p(
              '触发限流时接口返回 `429`,建议使用**指数退避**后重试:',
              'When a limit is hit the API returns `429`; retry with **exponential backoff**:'
            ),
          },
          {
            kind: 'code',
            label: 'JSON',
            code: `{
  "error": {
    "message": "Too Many Requests",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  }
}`,
          },
          {
            kind: 'note',
            text: p(
              '系统用请求中的 `max_tokens` 预估 TPM,请尽量贴近实际需求以减少误差。具体额度以你所在分组在控制台的显示为准;如需提额请联系管理员。',
              'The system estimates TPM from the request’s `max_tokens`, so keep it close to real needs to reduce error. Actual limits follow what your group shows in the console; contact the admin to request higher limits.'
            ),
          },
        ],
      },
      {
        id: 'error-codes',
        label: p('错误码速查', 'Error Codes'),
        blocks: [
          {
            kind: 'p',
            text: p(
              'AI 接口沿用 OpenAI 错误结构,常见 HTTP 状态码及处理建议:',
              'AI endpoints follow the OpenAI error structure. Common HTTP status codes and how to handle them:'
            ),
          },
          {
            kind: 'table',
            head: [
              p('状态码', 'Code'),
              p('含义', 'Meaning'),
              p('处理建议', 'What to do'),
            ],
            rows: [
              [
                '`400`',
                p('参数不合法', 'Invalid parameters'),
                p(
                  '按 message 修正请求体',
                  'Fix the request body per the message'
                ),
              ],
              [
                '`401`',
                p('密钥缺失或无效', 'Missing or invalid key'),
                p(
                  '检查 Authorization 头与令牌',
                  'Check the Authorization header and token'
                ),
              ],
              [
                '`403`',
                p(
                  '无权限 / 余额不足 / 需实名',
                  'No permission / low balance / needs verification'
                ),
                p(
                  '查看 message,充值或完成实名',
                  'Read message; top up or complete verification'
                ),
              ],
              [
                '`429`',
                p('触发速率限制', 'Rate limited'),
                p('降低频率,指数退避重试', 'Slow down; retry with backoff'),
              ],
              [
                '`500`',
                p('网关内部错误', 'Internal gateway error'),
                p(
                  '稍后重试,持续出现请联系客服',
                  'Retry later; contact support if persistent'
                ),
              ],
              [
                '`503` / `504`',
                p('上游负载高 / 超时', 'Upstream overloaded / timeout'),
                p(
                  '稍后重试,或改用流式输出',
                  'Retry later, or switch to streaming'
                ),
              ],
            ],
          },
          {
            kind: 'p',
            text: p(
              '错误原因通常写在响应的 `error.message` 中,打印它即可定位大部分问题:',
              'The reason is usually in `error.message` of the response; printing it locates most issues:'
            ),
          },
          {
            kind: 'code',
            label: 'JSON',
            code: `{
  "error": {
    "message": "Insufficient quota for this request",
    "type": "insufficient_quota",
    "param": null,
    "code": "insufficient_quota"
  }
}`,
          },
        ],
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Tool integrations
// ---------------------------------------------------------------------------

export const buildToolsGroup = (baseUrl: string, lang: DocLang): DocGroup => {
  const p = makePick(lang)
  const INSTALL = p('安装', 'Install')
  const CONFIG = p('配置', 'Configure')
  const MODELS = p('推荐模型', 'Recommended models')

  return {
    id: 'tools',
    superLabel: p('工具接入', 'Integrations'),
    categories: [
      {
        id: 'tools-cli',
        label: p('命令行工具', 'CLI Tools'),
        items: [
          {
            id: 'tool-claude-code',
            label: 'Claude Code',
            blocks: [
              {
                kind: 'p',
                text: p(
                  'Anthropic 官方命令行编程工具,通过 Claude 兼容协议接入。',
                  'Anthropic’s official CLI coding tool, connected via the Claude-compatible protocol.'
                ),
              },
              { kind: 'h3', text: INSTALL },
              {
                kind: 'code',
                label: 'bash',
                code: 'npm install -g @anthropic-ai/claude-code',
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'p',
                text: p(
                  '设置环境变量后进入项目运行 `claude`。注意 `ANTHROPIC_BASE_URL` 填服务器地址本身(工具会自动追加 `/v1/messages`)。',
                  'Set the environment variables, then run `claude` inside your project. Set `ANTHROPIC_BASE_URL` to the server address itself (the tool appends `/v1/messages`).'
                ),
              },
              {
                kind: 'code',
                label: 'zsh',
                code: `echo 'export ANTHROPIC_API_KEY="sk-xxxxxx"' >> ~/.zshrc
echo 'export ANTHROPIC_BASE_URL="${baseUrl}"' >> ~/.zshrc
source ~/.zshrc`,
              },
              {
                kind: 'code',
                label: 'PowerShell',
                code: `[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-xxxxxx", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "${baseUrl}", "User")`,
              },
              { kind: 'h3', text: MODELS },
              {
                kind: 'list',
                items: [
                  p(
                    '日常编程:`claude-3-5-sonnet`',
                    'Everyday coding: `claude-3-5-sonnet`'
                  ),
                  p(
                    '复杂重构:更强的 Claude 推理模型',
                    'Complex refactoring: a stronger Claude reasoning model'
                  ),
                ],
              },
              {
                kind: 'note',
                text: p(
                  'Agent 模式调用频繁、token 消耗较大,建议充值后使用不限速分组。',
                  'Agent mode calls the model frequently and burns tokens fast; use an unthrottled group after topping up.'
                ),
              },
            ],
          },
          {
            id: 'tool-codex-cli',
            label: 'OpenAI Codex CLI',
            blocks: [
              {
                kind: 'p',
                text: p(
                  'OpenAI 官方命令行编程 Agent,通过自定义 model provider 接入(使用 Responses 协议)。',
                  'OpenAI’s official CLI coding agent, connected via a custom model provider (Responses protocol).'
                ),
              },
              { kind: 'h3', text: INSTALL },
              {
                kind: 'code',
                label: 'bash',
                code: 'npm install -g @openai/codex',
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'code',
                label: 'zsh',
                code: `echo 'export OPENAI_API_KEY="sk-xxxxxx"' >> ~/.zshrc
source ~/.zshrc`,
              },
              {
                kind: 'p',
                text: p(
                  '在 `~/.codex/config.toml` 中添加自定义 provider:',
                  'Add a custom provider to `~/.codex/config.toml`:'
                ),
              },
              {
                kind: 'code',
                label: 'config.toml',
                code: `model = "gpt-4o"
model_provider = "custom"          # required, otherwise gpt-4o goes to OpenAI
disable_response_storage = true

[model_providers.custom]
name = "Custom Gateway"
base_url = "${baseUrl}/v1"
env_key = "OPENAI_API_KEY"         # env var NAME, not the key value
wire_api = "responses"`,
              },
              {
                kind: 'note',
                text: p(
                  '三项必填:`model_provider`(否则 gpt-4o 会直连 OpenAI)、`wire_api = "responses"`、`env_key` 填环境变量名。若曾用 ChatGPT 登录,删除 `~/.codex/auth.json` 后重试。',
                  'Three required settings: `model_provider` (else gpt-4o goes straight to OpenAI), `wire_api = "responses"`, and `env_key` = the env var name. If you previously logged in via ChatGPT, delete `~/.codex/auth.json` and retry.'
                ),
              },
            ],
          },
          {
            id: 'tool-gemini-cli',
            label: 'Gemini CLI',
            blocks: [
              {
                kind: 'p',
                text: p(
                  'Google 官方命令行工具,通过 OpenAI 兼容模式接入。',
                  'Google’s official CLI, connected via OpenAI-compatible mode.'
                ),
              },
              { kind: 'h3', text: INSTALL },
              { kind: 'code', label: 'bash', code: 'pip install gemini-cli' },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'code',
                label: 'zsh',
                code: `echo 'export OPENAI_API_KEY="sk-xxxxxx"' >> ~/.zshrc
echo 'export OPENAI_API_BASE="${baseUrl}/v1"' >> ~/.zshrc
source ~/.zshrc`,
              },
              { kind: 'code', label: 'bash', code: 'gemini --model gpt-4o' },
              {
                kind: 'note',
                text: p(
                  '设置 `OPENAI_API_BASE` 后即从 Google 官方 API 切换到本站兼容接口。',
                  'Setting `OPENAI_API_BASE` switches it from Google’s official API to this site’s compatible interface.'
                ),
              },
            ],
          },
          {
            id: 'tool-aider',
            label: 'Aider',
            blocks: [
              {
                kind: 'p',
                text: p(
                  '终端里的 AI 结对编程工具,自动改代码、跑测试并提交 Git,通过 OpenAI 兼容接口接入。',
                  'Terminal AI pair-programming that edits code, runs tests and commits to Git, via the OpenAI-compatible interface.'
                ),
              },
              { kind: 'h3', text: INSTALL },
              { kind: 'code', label: 'bash', code: 'pip install aider-chat' },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'code',
                label: 'zsh',
                code: `echo 'export OPENAI_API_KEY="sk-xxxxxx"' >> ~/.zshrc
echo 'export OPENAI_API_BASE="${baseUrl}/v1"' >> ~/.zshrc
source ~/.zshrc`,
              },
              {
                kind: 'code',
                label: 'bash',
                code: 'cd your-project\naider --model gpt-4o',
              },
              {
                kind: 'p',
                text: p('使用 Claude 模型:', 'To use Claude models:'),
              },
              {
                kind: 'code',
                label: 'bash',
                code: `export ANTHROPIC_API_KEY="sk-xxxxxx"
export ANTHROPIC_BASE_URL="${baseUrl}"
aider --model claude-3-5-sonnet`,
              },
              {
                kind: 'note',
                text: p(
                  'Aider 默认自动提交到 Git,建议从干净的工作区开始,便于用 `/undo` 回滚。',
                  'Aider auto-commits to Git by default; start from a clean tree so you can roll back with `/undo`.'
                ),
              },
            ],
          },
          {
            id: 'tool-openclaw',
            label: 'OpenClaw',
            blocks: [
              {
                kind: 'p',
                text: p(
                  '开源命令行 AI 编程 Agent,通过 OpenAI 兼容接口接入。',
                  'Open-source CLI AI coding agent, connected via the OpenAI-compatible interface.'
                ),
              },
              { kind: 'h3', text: INSTALL },
              { kind: 'code', label: 'bash', code: 'pip install openclaw' },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'code',
                label: 'zsh',
                code: `echo 'export OPENAI_API_KEY="sk-xxxxxx"' >> ~/.zshrc
echo 'export OPENAI_API_BASE="${baseUrl}/v1"' >> ~/.zshrc
source ~/.zshrc`,
              },
              {
                kind: 'note',
                text: p(
                  `也可直接运行 \`openclaw\`,按提示交互式填入 API Key、Base URL(\`${baseUrl}/v1\`)与模型。`,
                  `You can also run \`openclaw\` and enter the API Key, Base URL (\`${baseUrl}/v1\`) and model interactively.`
                ),
              },
            ],
          },
        ],
      },
      {
        id: 'tools-editors',
        label: p('编辑器与 IDE', 'Editors & IDEs'),
        items: [
          {
            id: 'tool-cursor',
            label: 'Cursor',
            blocks: [
              {
                kind: 'p',
                text: p(
                  '基于 VS Code 的 AI 编程 IDE。在设置中覆盖 OpenAI 接口地址即可接入。',
                  'A VS Code-based AI coding IDE. Override the OpenAI base URL in settings to connect.'
                ),
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'list',
                items: [
                  p(
                    '打开 **Cursor Settings → Models**,展开 **OpenAI API Key**。',
                    'Open **Cursor Settings → Models**, expand **OpenAI API Key**.'
                  ),
                  p(
                    '**OpenAI API Key**:填入 `sk-xxxxxx`。',
                    '**OpenAI API Key**: enter `sk-xxxxxx`.'
                  ),
                  p(
                    `**Override OpenAI Base URL**:填 \`${baseUrl}/v1\`,点 **Verify**。`,
                    `**Override OpenAI Base URL**: enter \`${baseUrl}/v1\`, then click **Verify**.`
                  ),
                  p(
                    '在 Models 列表添加模型名,如 `gpt-4o`、`claude-3-5-sonnet`。',
                    'Add model names in the Models list, e.g. `gpt-4o`, `claude-3-5-sonnet`.'
                  ),
                ],
              },
              {
                kind: 'note',
                text: p(
                  '第三方 API 模式目前仅支持 Chat 功能;Tab 补全与 Agent 需 Cursor 官方订阅。',
                  'Third-party API mode currently supports Chat only; Tab completion and Agent require an official Cursor subscription.'
                ),
              },
            ],
          },
          {
            id: 'tool-cline',
            label: 'Cline',
            blocks: [
              {
                kind: 'p',
                text: p(
                  'VS Code 上强大的 AI 编程扩展,可自主读写文件、执行命令。',
                  'A powerful VS Code AI coding extension that can autonomously read/write files and run commands.'
                ),
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'list',
                items: [
                  p(
                    '**API Provider**:选择 `OpenAI Compatible`。',
                    '**API Provider**: choose `OpenAI Compatible`.'
                  ),
                  p(
                    `**Base URL**:\`${baseUrl}/v1\``,
                    `**Base URL**: \`${baseUrl}/v1\``
                  ),
                  p('**API Key**:`sk-xxxxxx`', '**API Key**: `sk-xxxxxx`'),
                  p(
                    '**Model**:如 `gpt-4o` 或 `claude-3-5-sonnet`',
                    '**Model**: e.g. `gpt-4o` or `claude-3-5-sonnet`'
                  ),
                ],
              },
              {
                kind: 'note',
                text: p(
                  `如需 Claude 模型,可将 Provider 改为 \`Anthropic\`,Base URL 填 \`${baseUrl}\`。Agent 模式会自动读写文件与执行命令,请仅在可信目录使用。`,
                  `For Claude models, switch Provider to \`Anthropic\` and set Base URL to \`${baseUrl}\`. Agent mode reads/writes files and runs commands automatically, so use it only in trusted directories.`
                ),
              },
            ],
          },
          {
            id: 'tool-roo-code',
            label: 'Roo Code',
            blocks: [
              {
                kind: 'p',
                text: p(
                  'Cline 的增强分支,支持 Code / Architect / Ask / Debug 多模式,每种模式可用不同模型。',
                  'An enhanced fork of Cline with Code / Architect / Ask / Debug modes, each able to use a different model.'
                ),
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'list',
                items: [
                  p(
                    '**API Provider**:`OpenAI Compatible`',
                    '**API Provider**: `OpenAI Compatible`'
                  ),
                  p(
                    `**Base URL**:\`${baseUrl}/v1\``,
                    `**Base URL**: \`${baseUrl}/v1\``
                  ),
                  p('**API Key**:`sk-xxxxxx`', '**API Key**: `sk-xxxxxx`'),
                  p(
                    `如需 Claude:新增 \`Anthropic\` provider,Base URL 填 \`${baseUrl}\`。`,
                    `For Claude: add an \`Anthropic\` provider with Base URL \`${baseUrl}\`.`
                  ),
                ],
              },
              {
                kind: 'note',
                text: p(
                  '建议 Code / Debug 用能力更强的模型,Ask / Architect 用更快更省的模型。',
                  'Use a stronger model for Code / Debug, and a faster, cheaper model for Ask / Architect.'
                ),
              },
            ],
          },
          {
            id: 'tool-continue',
            label: 'Continue',
            blocks: [
              {
                kind: 'p',
                text: p(
                  '面向 VS Code 与 JetBrains 的开源 AI 编程助手,用配置文件管理多个模型。',
                  'Open-source AI coding assistant for VS Code and JetBrains, configured via a file with multiple models.'
                ),
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'p',
                text: p(
                  '编辑 `~/.continue/config.yaml`:',
                  'Edit `~/.continue/config.yaml`:'
                ),
              },
              {
                kind: 'code',
                label: 'config.yaml',
                code: `models:
  - name: gpt-4o
    provider: openai
    model: gpt-4o
    apiKey: sk-xxxxxx
    apiBase: ${baseUrl}/v1

  - name: Claude Sonnet
    provider: anthropic
    model: claude-3-5-sonnet
    apiKey: sk-xxxxxx
    apiBase: ${baseUrl}`,
              },
              {
                kind: 'note',
                text: p(
                  `OpenAI 兼容模型 \`apiBase\` 填 \`${baseUrl}/v1\`;Anthropic 模型填 \`${baseUrl}\`。`,
                  `For OpenAI-compatible models set \`apiBase\` to \`${baseUrl}/v1\`; for Anthropic models use \`${baseUrl}\`.`
                ),
              },
            ],
          },
          {
            id: 'tool-zed',
            label: 'Zed',
            blocks: [
              {
                kind: 'p',
                text: p(
                  '高性能开源编辑器,内置 AI 助手,支持自定义 OpenAI 兼容接口。',
                  'A high-performance open-source editor with a built-in AI assistant supporting custom OpenAI-compatible endpoints.'
                ),
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'p',
                text: p(
                  '按 `Cmd/Ctrl + ,` 打开 `settings.json`,加入:',
                  'Press `Cmd/Ctrl + ,` to open `settings.json` and add:'
                ),
              },
              {
                kind: 'code',
                label: 'settings.json',
                code: `{
  "language_models": {
    "openai": {
      "api_url": "${baseUrl}/v1",
      "api_key": "sk-xxxxxx"
    }
  }
}`,
              },
              {
                kind: 'note',
                text: p(
                  '在右侧 AI 面板选择模型(如 `gpt-4o`)。',
                  'Pick a model (e.g. `gpt-4o`) in the AI panel on the right.'
                ),
              },
            ],
          },
        ],
      },
      {
        id: 'tools-clients',
        label: p('聊天客户端', 'Chat Clients'),
        items: [
          {
            id: 'tool-chatbox',
            label: 'Chatbox',
            blocks: [
              {
                kind: 'p',
                text: p(
                  '全平台桌面 / 移动 AI 聊天客户端,安装简单、功能丰富。',
                  'A cross-platform desktop / mobile AI chat client that is easy to install and feature-rich.'
                ),
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'list',
                items: [
                  p(
                    'API 模式:选择 `OpenAI API 兼容`。',
                    'API mode: choose `OpenAI API compatible`.'
                  ),
                  p(
                    `API 域名 / Host:\`${baseUrl}/v1\``,
                    `API Host: \`${baseUrl}/v1\``
                  ),
                  p('API Key:`sk-xxxxxx`', 'API Key: `sk-xxxxxx`'),
                  p(
                    '添加需要使用的模型,如 `gpt-4o`。',
                    'Add the models you need, e.g. `gpt-4o`.'
                  ),
                ],
              },
            ],
          },
          {
            id: 'tool-lobechat',
            label: 'LobeChat',
            blocks: [
              {
                kind: 'p',
                text: p(
                  '开源聊天应用,支持对话、绘图、语音等。',
                  'An open-source chat app supporting chat, drawing, voice and more.'
                ),
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'list',
                items: [
                  p(
                    '进入 **设置 → 语言模型 → OpenAI**。',
                    'Go to **Settings → Language Model → OpenAI**.'
                  ),
                  p('API Key:`sk-xxxxxx`', 'API Key: `sk-xxxxxx`'),
                  p(
                    `接口代理地址:\`${baseUrl}/v1\``,
                    `API proxy address: \`${baseUrl}/v1\``
                  ),
                  p(
                    '开启开关并填入要使用的模型。',
                    'Enable it and add the models you want.'
                  ),
                ],
              },
            ],
          },
          {
            id: 'tool-nextchat',
            label: 'NextChat',
            blocks: [
              {
                kind: 'p',
                text: p(
                  '轻量的跨平台 ChatGPT 客户端,支持自定义接口地址。',
                  'A lightweight cross-platform ChatGPT client supporting a custom endpoint.'
                ),
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'list',
                items: [
                  p(
                    '进入 **设置 → 自定义接口**,开启自定义。',
                    'Go to **Settings → Custom Endpoint** and enable it.'
                  ),
                  p(
                    `接口地址 / Endpoint:\`${baseUrl}\``,
                    `Endpoint: \`${baseUrl}\``
                  ),
                  p('API Key:`sk-xxxxxx`', 'API Key: `sk-xxxxxx`'),
                  p(
                    '自定义模型名,如 `gpt-4o`。',
                    'Custom model name, e.g. `gpt-4o`.'
                  ),
                ],
              },
              {
                kind: 'note',
                text: p(
                  `若接口地址填 \`${baseUrl}\` 无法连通,可改填 \`${baseUrl}/v1\`。`,
                  `If the endpoint \`${baseUrl}\` does not connect, try \`${baseUrl}/v1\` instead.`
                ),
              },
            ],
          },
        ],
      },
      {
        id: 'tools-browser',
        label: p('浏览器扩展', 'Browser Extensions'),
        items: [
          {
            id: 'tool-immersive-translate',
            label: p('沉浸式翻译', 'Immersive Translate'),
            blocks: [
              {
                kind: 'p',
                text: p(
                  '知名的双语网页翻译插件,可接入本站大模型实现网页 / PDF / 视频字幕的实时翻译。',
                  'A popular bilingual web translation extension; connect it to this site’s models for real-time translation of web pages, PDFs and video subtitles.'
                ),
              },
              { kind: 'h3', text: CONFIG },
              {
                kind: 'list',
                items: [
                  p(
                    '打开插件 **设置 → 翻译服务 → 添加自定义翻译服务 → 自定义 AI**。',
                    'Open the extension: **Settings → Translation Service → Add Custom Service → Custom AI**.'
                  ),
                  p(
                    `自定义 API 接口地址:\`${baseUrl}/v1/chat/completions\``,
                    `Custom API endpoint: \`${baseUrl}/v1/chat/completions\``
                  ),
                  p('API Key:`sk-xxxxxx`', 'API Key: `sk-xxxxxx`'),
                  p(
                    '模型名称:本站支持的文本模型,如 `deepseek-v3`。',
                    'Model name: any text model available here, e.g. `deepseek-v3`.'
                  ),
                ],
              },
              {
                kind: 'note',
                text: p(
                  '翻译请求量较大,建议选择速度快、价格低的文本模型。',
                  'Translation makes many requests; prefer a fast, low-cost text model.'
                ),
              },
            ],
          },
        ],
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export const buildFaqGroup = (_baseUrl: string, lang: DocLang): DocGroup => {
  const p = makePick(lang)
  return {
    id: 'faq',
    superLabel: p('常见问题', 'FAQ'),
    categories: [
      {
        id: 'faq-auth',
        label: p('实名认证', 'Identity Verification'),
        blocks: [
          {
            kind: 'p',
            text: p(
              '部分功能或部分模型可能需要完成实名认证,用于保护账户安全与满足合规要求。',
              'Some features or models may require identity verification to protect your account and meet compliance requirements.'
            ),
          },
          {
            kind: 'p',
            text: p(
              '流程:进入 **控制台 → 实名认证**,选择证件类型、上传证件照并填写姓名与证件号,提交后等待审核。',
              'Process: go to **Console → Identity Verification**, pick a document type, upload a photo, enter your name and document number, then submit and wait for review.'
            ),
          },
          {
            kind: 'note',
            text: p(
              '是否需要实名、支持的证件类型以站点实际设置为准;遇到问题请联系客服。',
              'Whether verification is required and which documents are accepted follow the site’s settings; contact support if you run into issues.'
            ),
          },
        ],
      },
      {
        id: 'faq-balance',
        label: p('账户余额与告警', 'Balance & Alerts'),
        blocks: [
          {
            kind: 'p',
            text: p(
              '平台以配额计量消费,余额不足会导致调用失败(常见 `403`)。请及时充值。',
              'Consumption is metered as quota; an insufficient balance causes call failures (often `403`). Top up in time.'
            ),
          },
          {
            kind: 'p',
            text: p(
              '建议在 **控制台 → 个人设置** 中设置余额告警阈值,低于阈值时通过站内信 / 邮件等渠道提醒。',
              'We recommend setting a balance alert threshold in **Console → Profile Settings**; you’ll be notified via in-app message / email when the balance drops below it.'
            ),
          },
          {
            kind: 'note',
            text: p(
              '退款请联系客服,具体规则以站点公告为准。',
              'For refunds contact support; the exact policy follows the site’s announcements.'
            ),
          },
        ],
      },
      {
        id: 'faq-invoice',
        label: p('发票与收据', 'Invoices & Receipts'),
        blocks: [
          {
            kind: 'p',
            text: p(
              '充值记录可在 **控制台 → 钱包 / 账单** 中查看。',
              'Top-up history is available in **Console → Wallet / Billing**.'
            ),
          },
          {
            kind: 'p',
            text: p(
              '如需正式发票,请联系客服并提供抬头、税号与开票金额。',
              'For a formal invoice, contact support with your billing title, tax ID and amount.'
            ),
          },
        ],
      },
      {
        id: 'faq-usage',
        label: p('使用须知与合规', 'Usage & Compliance'),
        blocks: [
          {
            kind: 'p',
            text: p(
              '使用本平台即代表你同意用户协议与隐私政策,并对基于本平台构建的应用的内容与行为负责。',
              'By using this platform you agree to the Terms of Service and Privacy Policy, and you are responsible for the content and behavior of applications you build on it.'
            ),
          },
          {
            kind: 'list',
            items: [
              p(
                '内容合规:确保生成 / 展示的内容符合当地法律。',
                'Content compliance: ensure generated/displayed content meets local laws.'
              ),
              p(
                '用户保护:保护终端用户数据,遵守隐私法规。',
                'User protection: protect end-user data and follow privacy regulations.'
              ),
              p(
                'AIGC 标识:在法规要求时向用户披露内容由 AI 生成。',
                'AI disclosure: where required, disclose that content is AI-generated.'
              ),
            ],
          },
          {
            kind: 'note',
            text: p(
              '禁止用于违法有害内容、欺诈、大规模滥用等用途;违规可能导致账户被暂停或终止。',
              'Prohibited uses include illegal/harmful content, fraud, and large-scale abuse; violations may lead to suspension or termination.'
            ),
          },
        ],
      },
    ],
  }
}
