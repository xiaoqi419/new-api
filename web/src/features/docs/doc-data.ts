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

// Data-driven content for the 接入文档 (Docs) page.
// Three-level tree: group (superLabel) -> category -> items (endpoint leaves).
//   - A category with `items` is collapsible; each item is a TOC leaf + a content section.
//   - A category with `blocks` (no items) is itself a leaf (used by 开始 / 参考).
// Inline markup inside text: `code` for inline code, **bold** for emphasis.

import {
  buildFaqGroup,
  buildGuidesGroup,
  buildToolsGroup,
} from './doc-data-guides'

export type DocLang = 'zh' | 'en'

export type DocParamRow = {
  name: string
  type: string
  required?: boolean
  default?: string
  desc: string
}

export type DocBlock =
  | { kind: 'p'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'endpoint'; method: string; path: string }
  | { kind: 'code'; label?: string; code: string }
  | { kind: 'params'; rows: DocParamRow[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'list'; items: string[] }
  | { kind: 'cards'; cards: { title: string; desc: string }[] }

export type DocItem = {
  id: string
  label: string
  method?: string
  blocks: DocBlock[]
}

export type DocCategory = {
  id: string
  label: string
  items?: DocItem[]
  blocks?: DocBlock[]
}

export type DocGroup = {
  id: string
  superLabel: string
  categories: DocCategory[]
}

// The API reference started as a Chinese-first data tree. Keep its stable IDs and
// protocol literals in place, then project its user-facing fields through this
// localized copy map so every consumer (sidebar, document body and Markdown)
// reads the same language-resolved tree.
const ENGLISH_DOCUMENT_TEXT: Record<string, string> = {
  开始: 'Getting Started',
  概述: 'Overview',
  概览: 'Overview',
  '本平台是一个统一的 AI API 网关,聚合多家上游模型服务,并以 **OpenAI / Claude / Gemini 兼容格式** 对外分发。下游只需一个 API 密钥即可调用聊天、补全、嵌入、重排序、审查、音频、图像、视频等能力,无需分别对接各上游厂商。':
    'This platform is a unified AI API gateway that aggregates upstream model services and exposes them in **OpenAI / Claude / Gemini-compatible formats**. A single API key gives downstream clients access to chat, completions, embeddings, reranking, moderation, audio, image, and video capabilities without integrating each upstream provider separately.',
  兼容主流格式: 'Compatible Formats',
  'OpenAI、Anthropic Claude、Google Gemini 原生格式均可直接调用。':
    'Use the native OpenAI, Anthropic Claude, and Google Gemini formats directly.',
  统一鉴权计费: 'Unified Authentication & Billing',
  '一个 Bearer 密钥贯穿全部接口,按量计费、分组倍率透明。':
    'One Bearer key works across every endpoint, with usage-based billing and transparent group multipliers.',
  多模态能力: 'Multimodal Capabilities',
  '文本、向量、语音、图像、视频(含 Seedance 2.0 / Sora / Kling)。':
    'Text, vectors, audio, images, and video (including Seedance 2.0 / Sora / Kling).',
  '接口分为两大类:**AI 模型接口**(兼容 OpenAI 格式,用中转密钥 `sk-xxx` 调用)与**管理接口**(控制台后台功能,用登录会话或系统访问令牌调用)。':
    'Endpoints fall into two groups: **AI model APIs** (OpenAI-compatible and called with a relay key such as `sk-xxx`) and **management APIs** (console administration features called with a signed-in session or system access token).',
  鉴权与请求地址: 'Authentication & Base URL',
  'AI 模型接口统一使用 Bearer Token 鉴权。在请求头中携带你的 API 密钥(可在 **控制台 → 令牌** 中创建):':
    'AI model APIs use Bearer Token authentication. Include your API key in the request headers (create one in **Console → Tokens**):',
  '请求基地址(base_url)为本站域名:':
    'The request base URL (base_url) is this site domain:',
  '管理接口(`/api/*`)使用**登录会话 Cookie 或用户系统访问令牌**鉴权,与中转用的 `sk-xxx` 密钥不同。部分接口需要管理员或 Root 权限。':
    'Management APIs (`/api/*`) use **a signed-in session cookie or user system access token**, not the relay `sk-xxx` key. Some endpoints require administrator or Root privileges.',
  通用约定与错误: 'Conventions & Errors',
  '流式响应(SSE)': 'Streaming Responses (SSE)',
  '聊天、补全等接口支持流式返回。请求体中设置 `"stream": true`,响应为 `text/event-stream`,每行以 `data: ` 开头,以 `data: [DONE]` 结束。':
    'Chat, completion, and related endpoints support streaming. Set `"stream": true` in the request body; the response is `text/event-stream`, with each line beginning `data: ` and ending `data: [DONE]`.',
  'AI 接口错误格式': 'AI API Error Format',
  'AI 模型接口沿用 OpenAI 错误结构,HTTP 状态码非 2xx 时返回:':
    'AI model APIs follow the OpenAI error structure and return this shape for non-2xx HTTP status codes:',
  管理接口响应格式: 'Management API Response Format',
  '管理接口(`/api/*`)统一返回如下信封结构,业务成功与否看 `success` 字段:':
    'Management APIs (`/api/*`) use the following envelope; inspect `success` to determine whether the operation succeeded:',
  成功: 'Success',
  失败: 'Failure',
  'HTTP 状态': 'HTTP Status',
  含义: 'Meaning',
  密钥缺失或无效: 'Missing or invalid key',
  '权限不足 / 令牌被禁用': 'Insufficient permission / token disabled',
  '触发速率限制(RPM/TPM),请降低频率':
    'Rate limit reached (RPM/TPM); reduce request frequency',
  上游或网关内部错误: 'Upstream or gateway internal error',
  'AI 模型接口': 'AI Model APIs',
  模型列表: 'Models',
  列出模型: 'List Models',
  '获取当前密钥可用的模型列表,兼容 OpenAI 格式。':
    'Retrieve the model list available to the current key in the OpenAI-compatible format.',
  '响应 200': 'Response 200',
  'Gemini 原生列表使用 `GET /v1beta/models`;OpenAI 兼容列表也可用 `GET /v1beta/openai/models`。':
    'For the native Gemini list use `GET /v1beta/models`; the OpenAI-compatible list is also available at `GET /v1beta/openai/models`.',
  获取单个模型: 'Retrieve a Model',
  '获取指定模型的信息。': 'Retrieve information for a specified model.',
  聊天: 'Chat',
  '原生 OpenAI 格式': 'Native OpenAI Format',
  'OpenAI 兼容的对话补全接口,是最常用的入口。':
    'The OpenAI-compatible chat completions endpoint is the most commonly used entry point.',
  '模型 ID': 'Model ID',
  '对话消息数组,每项含 role(system/user/assistant/tool)与 content':
    'Conversation message array; each item includes role (system/user/assistant/tool) and content',
  '是否流式返回(SSE)': 'Whether to stream the response (SSE)',
  '采样温度 0~2': 'Sampling temperature, from 0 to 2',
  核采样: 'Nucleus sampling',
  '最大生成 token 数': 'Maximum generated token count',
  '可调用的函数/工具定义': 'Callable function/tool definitions',
  工具选择策略: 'Tool selection strategy',
  '如 { "type": "json_object" }': 'For example, { "type": "json_object" }',
  停止序列: 'Stop sequence',
  终端用户标识: 'End-user identifier',
  '设置 `"stream": true` 后,响应为 SSE,逐块下发 `chat.completion.chunk`,以 `data: [DONE]` 结束。':
    'With `"stream": true`, the response is SSE, delivered as `chat.completion.chunk` events and terminated by `data: [DONE]`.',
  '原生 Claude 格式': 'Native Claude Format',
  'Anthropic Claude Messages 格式。': 'Anthropic Claude Messages format.',
  'OpenAI Responses 格式': 'OpenAI Responses Format',
  'OpenAI Responses API 格式。': 'OpenAI Responses API format.',
  '原生 Gemini 格式': 'Native Gemini Format',
  'Google Gemini 原生格式,路径含模型名与动作。':
    'Native Google Gemini format; the path includes the model name and action.',
  补全: 'Completions',
  '传统文本补全接口(非对话),兼容 OpenAI 格式。':
    'A traditional non-chat text completion endpoint in the OpenAI-compatible format.',
  提示词: 'Prompt',
  采样温度: 'Sampling temperature',
  是否流式: 'Whether to stream',
  嵌入: 'Embeddings',
  '将文本转换为向量,用于检索、聚类、相似度计算等。':
    'Convert text to vectors for retrieval, clustering, similarity calculation, and related tasks.',
  '嵌入模型 ID': 'Embedding model ID',
  '待嵌入文本,支持批量': 'Text to embed; batch input is supported',
  'float 或 base64': 'float or base64',
  '输出维度(部分模型支持)': 'Output dimensions (supported by some models)',
  'Gemini 向量嵌入格式。': 'Gemini vector embedding format.',
  重排序: 'Reranking',
  文档重排序: 'Document Reranking',
  '根据查询对候选文档重新排序,常用于 RAG 精排。':
    'Rerank candidate documents for a query, commonly used for final-stage RAG ranking.',
  '重排序模型 ID': 'Reranking model ID',
  查询语句: 'Query',
  候选文档列表: 'Candidate document list',
  '返回排名前 N 条': 'Return the top N ranked results',
  是否回传文档原文: 'Whether to return original document text',
  审查: 'Moderation',
  '检测文本是否违反内容安全策略。':
    'Detect whether text violates content safety policies.',
  '内容审查是合规工具之一,不替代平台自身的安全治理义务与上游内容政策要求。':
    'Content moderation is one compliance tool; it does not replace the platform’s own safety obligations or upstream content policies.',
  音频: 'Audio',
  语音合成: 'Speech Synthesis',
  '文本转语音(TTS)。': 'Text-to-speech (TTS).',
  'TTS 模型 ID(如 tts-1)': 'TTS model ID (for example, tts-1)',
  要合成的文本: 'Text to synthesize',
  '音色(如 alloy)': 'Voice (for example, alloy)',
  '语速 0.25~4.0': 'Speech speed, from 0.25 to 4.0',
  '成功时直接返回二进制音频流(非 JSON)。':
    'On success, the endpoint returns a binary audio stream rather than JSON.',
  语音转写: 'Speech Transcription',
  '语音识别(转写为同语种文本)。请求体为 `multipart/form-data`,字段:`file`(必填)、`model`(必填)、`language`、`prompt`、`response_format`、`temperature`。':
    'Speech recognition that transcribes to text in the same language. The request body is `multipart/form-data` with `file` (required), `model` (required), `language`, `prompt`, `response_format`, and `temperature` fields.',
  语音翻译: 'Speech Translation',
  '语音识别并翻译为英文。字段同「语音转写」。':
    'Recognize speech and translate it into English. Fields are the same as for Speech Transcription.',
  实时语音: 'Realtime Audio',
  实时会话: 'Realtime Session',
  '基于 WebSocket 的实时音频/文本双向流接口,兼容 OpenAI Realtime。':
    'A WebSocket-based bidirectional realtime audio/text stream compatible with OpenAI Realtime.',
  '使用 WebSocket 连接,`base_url` 的 http(s) 需替换为 ws(s),模型通过查询参数指定,鉴权用 Bearer 密钥:':
    'Connect with WebSocket: replace http(s) in `base_url` with ws(s), select the model through query parameters, and authenticate with a Bearer key:',
  '连接建立后按 Realtime 事件协议收发 `session.update`、`input_audio_buffer.append`、`response.create` 等事件。':
    'After connecting, send and receive `session.update`, `input_audio_buffer.append`, `response.create`, and other Realtime protocol events.',
  未实现: 'Not Implemented',
  图像变体: 'Image Variations',
  '占位接口,当前返回 `501 Not Implemented`。':
    'Placeholder endpoint; it currently returns `501 Not Implemented`.',
  '文件(Files)': 'Files',
  方法: 'Method',
  路径: 'Path',
  '微调(Fine-tuning)': 'Fine-tuning',
  图像: 'Images',
  'Gemini 原生格式': 'Native Gemini Format',
  '通过 Gemini 原生 `generateContent` 生成图像,适用于 `gemini-2.5-flash-image`、`gemini-3-pro-image-preview`、`nano-banana-pro-preview` 等图像模型。':
    'Generate images through native Gemini `generateContent`, for image models including `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, and `nano-banana-pro-preview`.',
  '内容数组,parts 支持 `text` 与 `inline_data`(图生图垫图)':
    'Content array; parts support `text` and `inline_data` (source image input)',
  '声明输出模态,含 `"IMAGE"` 才返回图片':
    'Declare output modalities; include `"IMAGE"` to return images',
  响应: 'Response',
  'OpenAI 聊天格式': 'OpenAI Chat Format',
  '用 OpenAI 兼容的 `chat/completions` 调用同一批 Gemini 图像模型;生成的图片在助手消息中返回。可在消息里带 `image_url` 做图生图。':
    'Call the same Gemini image models through OpenAI-compatible `chat/completions`; generated images are returned in the assistant message. Include `image_url` in a message for image-to-image generation.',
  'Gemini 图像模型(如 gemini-2.5-flash-image)':
    'Gemini image model (for example, gemini-2.5-flash-image)',
  '对话消息;content 可含文本或 image_url':
    'Conversation messages; content can include text or image_url',
  生成图像: 'Generate Images',
  '根据文本提示生成图像。`model` 可为 `dall-e-3`、`gpt-image-1`、`imagen-4.0-generate-001`(映射至 Google Imagen)等。':
    'Generate images from a text prompt. `model` can be `dall-e-3`, `gpt-image-1`, `imagen-4.0-generate-001` (mapped to Google Imagen), and others.',
  '图像模型 ID(如 dall-e-3、gpt-image-1、imagen-4.0-generate-001)':
    'Image model ID (for example, dall-e-3, gpt-image-1, imagen-4.0-generate-001)',
  图像描述: 'Image description',
  生成数量: 'Number of images to generate',
  尺寸: 'Size',
  '质量(standard/hd 等)': 'Quality (standard/hd, etc.)',
  'url 或 b64_json': 'url or b64_json',
  编辑图像: 'Edit Images',
  '基于原图与提示词进行编辑/局部重绘。请求体为 `multipart/form-data`;别名路径 `/v1/edits` 等价。':
    'Edit or inpaint from an original image and prompt. The request body is `multipart/form-data`; the alias path `/v1/edits` is equivalent.',
  '原始图像(PNG,必填)': 'Source image (PNG, required)',
  编辑描述: 'Edit description',
  '遮罩图,透明区域为待重绘部分':
    'Mask image; transparent areas are the regions to repaint',
  '图像模型 ID(如 gpt-image-1、dall-e-2)':
    'Image model ID (for example, gpt-image-1, dall-e-2)',
  '通义千问 OpenAI 格式': 'Qwen OpenAI Format',
  '以 OpenAI 兼容格式调用通义千问 / 万相图像模型(如 `qwen-image`、`wan2.2-t2i-flash`、`z-image`)。':
    'Call Qwen / Wanxiang image models (such as `qwen-image`, `wan2.2-t2i-flash`, and `z-image`) in the OpenAI-compatible format.',
  '模型 ID(如 qwen-image、wan2.2-t2i-flash、z-image)':
    'Model ID (for example, qwen-image, wan2.2-t2i-flash, z-image)',
  '尺寸(如 1024x1024)': 'Size (for example, 1024x1024)',
  '反向提示词(WAN 系列支持)': 'Negative prompt (supported by WAN models)',
  '基于输入图与提示词编辑图像(如 `qwen-image-edit`)。请求体为 `multipart/form-data`,`image` 字段最多可传 2 张图(URL 或 base64)。':
    'Edit images from input images and a prompt (for example, `qwen-image-edit`). The request body is `multipart/form-data`; the `image` field accepts up to two images (URL or base64).',
  '模型 ID(如 qwen-image-edit)': 'Model ID (for example, qwen-image-edit)',
  '待编辑图,最多 2 张(URL 或 base64)':
    'Images to edit, up to two (URL or base64)',
  'Midjourney 格式': 'Midjourney Format',
  'Midjourney 兼容 midjourney-proxy 协议,采用异步任务模型:先调用 `submit/*` 提交任务拿到 `taskId`,再轮询 `GET /mj/task/{id}/fetch` 获取进度与图片结果。':
    'Midjourney uses the compatible midjourney-proxy protocol and an asynchronous task model: call `submit/*` to receive a `taskId`, then poll `GET /mj/task/{id}/fetch` for progress and image results.',
  '可在路径前加运行模式,如 `/{mode}/mj/submit/imagine`(mode 取 `fast` / `turbo` / `relax`)。图片输入支持公网 URL 或 base64(`base64Array`)。可选 `notifyHook` 用于任务完成回调。':
    'You can prefix paths with a run mode, for example `/{mode}/mj/submit/imagine` (`fast` / `turbo` / `relax`). Image input supports a public URL or base64 (`base64Array`). Use optional `notifyHook` for a task-completion callback.',
  '文生图 Imagine': 'Text-to-Image Imagine',
  '根据提示词生成四格图,可在提示词内附带 `--ar`、`--v` 等 MJ 参数。':
    'Generate a four-image grid from a prompt. The prompt can include MJ options such as `--ar` and `--v`.',
  '提示词,可带 MJ 后缀参数': 'Prompt, optionally with MJ suffix parameters',
  '垫图(图生图)的 base64 列表':
    'base64 list of source images for image-to-image generation',
  任务完成回调地址: 'Task-completion callback URL',
  自定义透传状态: 'Custom passthrough state',
  '混图 Blend': 'Blend Images',
  '将 2-5 张图融合为一张。': 'Blend 2 to 5 images into one.',
  '2-5 张图的 base64': 'base64 of 2 to 5 images',
  '比例:PORTRAIT / SQUARE / LANDSCAPE':
    'Aspect ratio: PORTRAIT / SQUARE / LANDSCAPE',
  '图生文 Describe': 'Image-to-Prompt Describe',
  '上传图片,反推 4 条提示词。':
    'Upload an image to derive four prompt suggestions.',
  '图片 base64': 'Image base64',
  '变换 Change(放大/变体/重绘)': 'Change (Upscale / Variation / Reroll)',
  '对已完成的 Imagine 任务做放大(UPSCALE)、变体(VARIATION)或重绘(REROLL)。':
    'Upscale (UPSCALE), vary (VARIATION), or reroll (REROLL) a completed Imagine task.',
  '源任务 ID': 'Source task ID',
  '1-4,选择第几张': '1 to 4, choose the image number',
  '也可用 `POST /mj/submit/simple-change`,body `{ "content": "148xxxxxxxxx U1" }` 的简写形式。':
    'You can also use the short form `POST /mj/submit/simple-change` with body `{ "content": "148xxxxxxxxx U1" }`.',
  '按钮动作 Action / Modal': 'Button Action / Modal',
  '触发返回结果中的按钮(如 U1/V1、Vary、Zoom、Pan 等);部分动作需再提交 Modal 填入内容。':
    'Trigger a button in a result (such as U1/V1, Vary, Zoom, or Pan); some actions require another Modal submission with content.',
  '按钮的 customId': 'Button customId',
  'Modal body:`{ taskId, prompt?, maskBase64? }`,用于 Inpaint / 自定义 Zoom 等二次输入。':
    'Modal body: `{ taskId, prompt?, maskBase64? }`, used for follow-up input such as Inpaint or custom Zoom.',
  '提示词分析 Shorten': 'Prompt Analysis Shorten',
  '分析提示词权重并给出精简建议。':
    'Analyze prompt weighting and suggest a shorter version.',
  待分析提示词: 'Prompt to analyze',
  '局部重绘 Edits': 'Inpaint Edits',
  '基于遮罩对图像做局部编辑。': 'Perform local image editing from a mask.',
  '视频 Video': 'Video',
  'Midjourney 视频生成任务,提交后同样通过 fetch 轮询结果。':
    'Midjourney video generation task; poll the result through fetch after submission.',
  '换脸 InsightFace Swap': 'Face Swap with InsightFace',
  '将源人脸替换到目标图。':
    'Replace the face in the target image with the source face.',
  '源人脸图 base64': 'Source face image base64',
  '目标图 base64': 'Target image base64',
  上传图片: 'Upload Image',
  '上传 base64 图片,返回可复用的图片地址。':
    'Upload a base64 image and receive a reusable image URL.',
  任务查询: 'Task Lookup',
  '按任务 ID 轮询进度、状态与图片结果。':
    'Poll progress, status, and image results by task ID.',
  说明: 'Description',
  '查询单个任务(status/progress/imageUrl)':
    'Retrieve one task (status/progress/imageUrl)',
  '获取任务图片 seed': 'Retrieve the task image seed',
  '按 `{ ids: [...] }` 批量查询': 'Batch query by `{ ids: [...] }`',
  拉取存储的图片字节: 'Retrieve stored image bytes',
  视频: 'Video',
  'Seedance 2.0 · 视频生成': 'Seedance 2.0 · Video Generation',
  概述与模型: 'Overview & Models',
  'Seedance 2.0(即梦 S2.0)是火山方舟提供的 AI 视频生成模型,支持文生视频、图生视频、多模态参考生视频,并可配合私域素材库实现虚拟人像的稳定生成。本平台以**官方 Ark 格式**对外分发,统一 Bearer 鉴权,下游只需一个密钥。':
    'Seedance 2.0 (Jimeng S2.0) is an AI video-generation model provided by Volcengine Ark. It supports text-to-video, image-to-video, and multimodal reference video generation, and can use a private asset library for consistent virtual-character generation. This platform exposes the **official Ark format** with unified Bearer authentication, so downstream clients need only one key.',
  '文生 / 图生视频': 'Text-to-Video / Image-to-Video',
  '文本、首帧/首尾帧图片驱动视频生成。':
    'Generate video from text, a first-frame image, or first/last-frame images.',
  多模态参考: 'Multimodal References',
  '图片 + 视频 + 音频混合参考,全新 / 编辑 / 延长视频。':
    'Mix image, video, and audio references to create, edit, or extend video.',
  私域素材库: 'Private Asset Library',
  '上传虚拟人像素材,生成时用 asset:// 引用。':
    'Upload virtual-character assets and reference them with asset:// during generation.',
  'Seedance 2.0 标准版(支持全部分辨率)':
    'Seedance 2.0 Standard (supports all resolutions)',
  'Seedance 2.0 Fast(更快,不支持 1080p)':
    'Seedance 2.0 Fast (faster; does not support 1080p)',
  创建视频任务: 'Create a Video Task',
  文生视频: 'Text-to-Video',
  '图生视频(首帧 / 首尾帧)':
    'Image-to-Video (First Frame / First and Last Frames)',
  '通过 `role` 指定图片用途:`first_frame`(首帧)、`last_frame`(尾帧)。':
    'Use `role` to specify image use: `first_frame` (first frame) or `last_frame` (last frame).',
  '多模态参考(图片 + 视频 + 音频)':
    'Multimodal References (Image + Video + Audio)',
  '支持图片(0-9) + 视频(0-3) + 音频(0-3),role 取 `reference_image` / `reference_video` / `reference_audio`。':
    'Supports images (0–9), videos (0–3), and audio (0–3); use role `reference_image` / `reference_video` / `reference_audio`.',
  '提示词中用「图片1」「视频1」「音频1」指代素材,序号为同类素材在请求体中的出现顺序,不要直接写 Asset ID。':
    'Refer to assets in the prompt as “image 1”, “video 1”, or “audio 1”. Their numbers follow the order of same-type assets in the request body; do not write an Asset ID directly.',
  返回: 'Response',
  查询视频任务: 'Query a Video Task',
  '响应(成功)': 'Response (Success)',
  '响应(失败)': 'Response (Failure)',
  'video_url 有效期约 24 小时,请及时转存。':
    'video_url is valid for about 24 hours; save it promptly.',
  请求参数: 'Request Parameters',
  '输入内容(文本 / 图片 / 视频 / 音频)':
    'Input content (text / image / video / audio)',
  '时长(秒),支持 4-15 或 -1(智能)':
    'Duration in seconds; supports 4–15 or -1 (automatic)',
  是否生成音频: 'Whether to generate audio',
  '随机种子,-1 为随机': 'Random seed; -1 selects a random seed',
  是否加水印: 'Whether to add a watermark',
  '终端用户标识,用于内容溯源(建议哈希)':
    'End-user identifier for content traceability (a hash is recommended)',
  任务状态变化回调地址: 'Task status-change callback URL',
  任务状态: 'Task Status',
  排队中: 'Queued',
  生成中: 'Generating',
  '成功,可获取 video_url': 'Succeeded; video_url is available',
  '失败,查看 error': 'Failed; see error',
  超时: 'Timed Out',
  已取消: 'Cancelled',
  'Seedance 2.0 · 私域素材库': 'Seedance 2.0 · Private Asset Library',
  入库流程: 'Asset Ingestion Flow',
  '私域素材库用于存放虚拟人像(AIGC)素材,入库后可在视频生成中通过 `asset://` 引用。整体流程:':
    'The private asset library stores virtual-character (AIGC) assets. Once ingested, they can be referenced in video generation through `asset://`. The overall flow is:',
  '素材库接口与视频生成共用同一个 API 密钥,签名由平台内部完成,下游无需关心 AK/SK。':
    'Asset library APIs and video generation share the same API key. The platform handles signing internally, so downstream clients do not need to manage AK/SK.',
  请求: 'Request',
  '仅支持公网 URL,不支持 base64。`AssetType` 支持 Image / Video / Audio。':
    'Only public URLs are supported; base64 is not supported. `AssetType` supports Image / Video / Audio.',
  'Status:Processing(处理中)-> Active(可用)/ Failed(失败)。':
    'Status: Processing (processing) -> Active (available) / Failed (failed).',
  素材管理接口: 'Asset Management APIs',
  '全部通过 `POST /ark/?Action={Action}&Version=2024-01-01` 调用,请求体为对应 Action 的 JSON。':
    'Call all asset-management APIs through `POST /ark/?Action={Action}&Version=2024-01-01` with the corresponding Action JSON in the request body.',
  创建素材组: 'Create an Asset Group',
  '上传素材(异步)': 'Upload an Asset (Asynchronous)',
  查询单个素材: 'Query an Asset',
  查询素材列表: 'Query Asset List',
  查询素材组列表: 'Query Asset Group List',
  查询单个素材组: 'Query an Asset Group',
  '更新素材 / 素材组': 'Update an Asset / Asset Group',
  '删除素材 / 素材组': 'Delete an Asset / Asset Group',
  在生成中引用素材: 'Reference an Asset in Generation',
  '素材 Status 变为 Active 后,在视频生成请求里用 `asset://<asset-id>` 作为图片 URL:':
    'When an asset Status becomes Active, use `asset://<asset-id>` as an image URL in a video-generation request:',
  'Sora / OpenAI 格式': 'Sora / OpenAI Format',
  '创建视频 · 表单': 'Create Video · Form',
  'OpenAI 兼容的视频生成(Sora 风格,multipart 表单提交)。':
    'OpenAI-compatible video generation in Sora style, submitted as a multipart form.',
  '模型 / 风格 ID': 'Model / style ID',
  文本描述提示词: 'Text description prompt',
  '图片输入(文件 / URL)': 'Image input (file / URL)',
  '视频时长(秒)': 'Video duration (seconds)',
  '尺寸,如 1280x720、1792x1024': 'Size, for example 1280x720 or 1792x1024',
  随机种子: 'Random seed',
  '创建视频 · JSON': 'Create Video · JSON',
  'JSON 提交方式,适合图生/多图参考视频。':
    'JSON submission, suitable for image-to-video or multi-image reference video.',
  文本描述: 'Text description',
  '首帧图片 URL(图生视频)': 'First-frame image URL (image-to-video)',
  多图参考: 'Multiple Image References',
  '时长(秒)': 'Duration (seconds)',
  透传给上游的扩展参数: 'Extended parameters passed through to the upstream',
  查询任务状态: 'Query Task Status',
  下载视频内容: 'Download Video Content',
  '任务完成后,通过该接口获取视频二进制内容(平台代理下载)。':
    'After task completion, use this endpoint to retrieve binary video content (downloaded by the platform on your behalf).',
  '视频改写(Remix)': 'Video Remix',
  'Kling 格式': 'Kling Format',
  '可灵(Kling)原生文生视频。': 'Native Kling text-to-video.',
  '模型(kling-v1 / kling-v1-6 / kling-v2-master)':
    'Model (kling-v1 / kling-v1-6 / kling-v2-master)',
  正向提示词: 'Positive prompt',
  负向提示词: 'Negative prompt',
  '自由度 0~1': 'Creativity from 0 to 1',
  'std(标准)/ pro(高品质)': 'std (standard) / pro (high quality)',
  运镜控制: 'Camera movement control',
  回调地址: 'Callback URL',
  图生视频: 'Image-to-Video',
  '在文生视频参数基础上增加:`image`(首帧图,URL 或 base64)、`image_tail`(尾帧图)、`static_mask`、`dynamic_masks`。':
    'In addition to text-to-video parameters, add `image` (first-frame image, URL or base64), `image_tail` (last-frame image), `static_mask`, and `dynamic_masks`.',
  已提交: 'Submitted',
  处理中: 'Processing',
  'Seedance · 参考': 'Seedance · Reference',
  错误码与内容安全: 'Error Codes & Content Safety',
  '当输入或输出触发安全检测时,会返回对应错误码:':
    'When input or output triggers safety checks, the corresponding error code is returned:',
  输入文本含敏感信息: 'Input text contains sensitive information',
  输入图片敏感: 'Input image is sensitive',
  输入视频敏感: 'Input video is sensitive',
  生成视频含敏感信息: 'Generated video contains sensitive information',
  违反平台规定: 'Violates platform rules',
  '遇到 429(TooManyRequests)请降低请求频率,并注意模型的 RPM / TPM 限制。':
    'When you receive 429 (TooManyRequests), reduce request frequency and observe the model RPM / TPM limits.',
  分辨率对照: 'Resolution Reference',
  分辨率: 'Resolution',
  'Seedance 2.0 Fast 不支持 1080p;标准版支持全部分辨率。':
    'Seedance 2.0 Fast does not support 1080p; Standard supports all resolutions.',
  最佳实践: 'Best Practices',
  '时长设为 -1,让模型自动选择合适时长。':
    'Set duration to -1 to let the model choose an appropriate duration.',
  '宽高比设为 adaptive,自动适配输入素材。':
    'Set aspect ratio to adaptive to automatically fit the input assets.',
  '提示词:中文 ≤ 500 字、英文 ≤ 1000 词,过长会丢失细节。':
    'Prompt length: Chinese ≤ 500 characters and English ≤ 1,000 words. Longer prompts can lose detail.',
  '有声视频:对话部分用双引号包裹,如 男人说:"你好"。':
    'For videos with audio, wrap dialogue in quotation marks, for example: a man says "hello".',
  '多素材引用:用「图1」「图2」精确指代。':
    'For multiple assets, refer to them precisely as “image 1” and “image 2”.',
  '真人素材:含真人人脸的图片**不能作为外部 URL 直接传入**(会触发 `InputImageSensitiveContentDetected`)。需先通过素材库 `CreateAsset` 入库,再用 `asset://` 引用即可正常生成,**无需活体认证**。':
    'Real-person assets: images containing real faces **cannot be sent directly as external URLs** (they trigger `InputImageSensitiveContentDetected`). First ingest them through `CreateAsset`, then reference them with `asset://` for normal generation; **no liveness verification is required**.',
  'video_url 有效期 24h、Asset URL 有效期 12h,请及时转存。':
    'video_url is valid for 24 hours and Asset URL for 12 hours; save them promptly.',
  参考: 'Reference',
  'SDK 快速接入': 'SDK Quick Start',
  '由于接口兼容 OpenAI 格式,可直接使用官方 OpenAI SDK,只需把 `base_url` 指向本站、`api_key` 换成你的令牌。':
    'Because the API is OpenAI-compatible, use the official OpenAI SDK directly. Point `base_url` to this site and replace `api_key` with your token.',
  计费与配额: 'Billing & Quota',
  '平台以**配额(quota)**计量,调用消耗按下式换算,分组倍率由你所在的用户分组决定:':
    'The platform measures usage in **quota**. Consumption is calculated as follows, with the group multiplier determined by your user group:',
  计费公式: 'Billing Formula',
  '文本类接口(聊天/补全/嵌入等)按输入与输出 token 计费。':
    'Text endpoints (chat, completions, embeddings, and more) are billed by input and output tokens.',
  '视频 / 图像 / 音频等任务类接口按上游返回的计费单元(如 total_tokens)换算。':
    'Task endpoints for video, images, audio, and more are converted from upstream billing units such as total_tokens.',
  '可在 **控制台 → 日志** 查看每次调用的实际消耗与倍率。':
    'View actual consumption and multipliers for each call in **Console → Logs**.',
  速率限制: 'Rate Limits',
  '为保障稳定性,接口存在 RPM(每分钟请求数)与 TPM(每分钟 token 数)限制。超限时返回 `429`,请指数退避后重试。':
    'For reliability, endpoints have RPM (requests per minute) and TPM (tokens per minute) limits. On `429`, retry with exponential backoff.',
  '不同模型 / 分组的限额不同,可在控制台查看你当前分组的限额。批量任务建议控制并发。':
    'Limits vary by model and group. View your current group limits in the console, and control concurrency for batch tasks.',
}

const localizeText = (text: string, lang: DocLang): string =>
  lang === 'zh' ? text : (ENGLISH_DOCUMENT_TEXT[text] ?? text)

const localizeBlock = (block: DocBlock, lang: DocLang): DocBlock => {
  switch (block.kind) {
    case 'p':
    case 'note':
    case 'h3':
      return { ...block, text: localizeText(block.text, lang) }
    case 'code':
      return {
        ...block,
        ...(block.label ? { label: localizeText(block.label, lang) } : {}),
      }
    case 'params':
      return {
        ...block,
        rows: block.rows.map((row) => ({
          ...row,
          desc: localizeText(row.desc, lang),
        })),
      }
    case 'table':
      return {
        ...block,
        head: block.head.map((head) => localizeText(head, lang)),
        rows: block.rows.map((row) =>
          row.map((cell) => localizeText(cell, lang))
        ),
      }
    case 'list':
      return {
        ...block,
        items: block.items.map((item) => localizeText(item, lang)),
      }
    case 'cards':
      return {
        ...block,
        cards: block.cards.map((card) => ({
          title: localizeText(card.title, lang),
          desc: localizeText(card.desc, lang),
        })),
      }
    case 'endpoint':
      return block
  }
}

const localizeGroup = (group: DocGroup, lang: DocLang): DocGroup => ({
  ...group,
  superLabel: localizeText(group.superLabel, lang),
  categories: group.categories.map((category) => ({
    ...category,
    label: localizeText(category.label, lang),
    ...(category.blocks
      ? { blocks: category.blocks.map((block) => localizeBlock(block, lang)) }
      : {}),
    ...(category.items
      ? {
          items: category.items.map((item) => ({
            ...item,
            label: localizeText(item.label, lang),
            blocks: item.blocks.map((block) => localizeBlock(block, lang)),
          })),
        }
      : {}),
  })),
})

const startGroup = (baseUrl: string): DocGroup => ({
  id: 'start',
  superLabel: '开始',
  categories: [
    {
      id: 'overview',
      label: '概述',
      blocks: [
        {
          kind: 'p',
          text: '本平台是一个统一的 AI API 网关,聚合多家上游模型服务,并以 **OpenAI / Claude / Gemini 兼容格式** 对外分发。下游只需一个 API 密钥即可调用聊天、补全、嵌入、重排序、审查、音频、图像、视频等能力,无需分别对接各上游厂商。',
        },
        {
          kind: 'cards',
          cards: [
            {
              title: '兼容主流格式',
              desc: 'OpenAI、Anthropic Claude、Google Gemini 原生格式均可直接调用。',
            },
            {
              title: '统一鉴权计费',
              desc: '一个 Bearer 密钥贯穿全部接口,按量计费、分组倍率透明。',
            },
            {
              title: '多模态能力',
              desc: '文本、向量、语音、图像、视频(含 Seedance 2.0 / Sora / Kling)。',
            },
          ],
        },
        {
          kind: 'p',
          text: '接口分为两大类:**AI 模型接口**(兼容 OpenAI 格式,用中转密钥 `sk-xxx` 调用)与**管理接口**(控制台后台功能,用登录会话或系统访问令牌调用)。',
        },
      ],
    },
    {
      id: 'auth',
      label: '鉴权与请求地址',
      blocks: [
        {
          kind: 'p',
          text: 'AI 模型接口统一使用 Bearer Token 鉴权。在请求头中携带你的 API 密钥(可在 **控制台 → 令牌** 中创建):',
        },
        {
          kind: 'code',
          label: 'Header',
          code: 'Authorization: Bearer sk-xxxxxx\nContent-Type: application/json',
        },
        { kind: 'p', text: '请求基地址(base_url)为本站域名:' },
        { kind: 'code', label: 'base_url', code: baseUrl },
        {
          kind: 'note',
          text: '管理接口(`/api/*`)使用**登录会话 Cookie 或用户系统访问令牌**鉴权,与中转用的 `sk-xxx` 密钥不同。部分接口需要管理员或 Root 权限。',
        },
      ],
    },
    {
      id: 'conventions',
      label: '通用约定与错误',
      blocks: [
        { kind: 'h3', text: '流式响应(SSE)' },
        {
          kind: 'p',
          text: '聊天、补全等接口支持流式返回。请求体中设置 `"stream": true`,响应为 `text/event-stream`,每行以 `data: ` 开头,以 `data: [DONE]` 结束。',
        },
        { kind: 'h3', text: 'AI 接口错误格式' },
        {
          kind: 'p',
          text: 'AI 模型接口沿用 OpenAI 错误结构,HTTP 状态码非 2xx 时返回:',
        },
        {
          kind: 'code',
          label: 'JSON',
          code: '{\n  "error": {\n    "message": "错误描述",\n    "type": "invalid_request_error",\n    "param": null,\n    "code": "invalid_api_key"\n  }\n}',
        },
        { kind: 'h3', text: '管理接口响应格式' },
        {
          kind: 'p',
          text: '管理接口(`/api/*`)统一返回如下信封结构,业务成功与否看 `success` 字段:',
        },
        {
          kind: 'code',
          label: '成功',
          code: '{\n  "success": true,\n  "message": "",\n  "data": { }\n}',
        },
        {
          kind: 'code',
          label: '失败',
          code: '{\n  "success": false,\n  "message": "错误描述"\n}',
        },
        {
          kind: 'table',
          head: ['HTTP 状态', '含义'],
          rows: [
            ['`401`', '密钥缺失或无效'],
            ['`403`', '权限不足 / 令牌被禁用'],
            ['`429`', '触发速率限制(RPM/TPM),请降低频率'],
            ['`500`', '上游或网关内部错误'],
          ],
        },
      ],
    },
  ],
})

const aiGroup = (baseUrl: string): DocGroup => ({
  id: 'ai',
  superLabel: 'AI 模型接口',
  categories: [
    {
      id: 'models',
      label: '模型列表',
      items: [
        {
          id: 'models-list',
          label: '列出模型',
          method: 'GET',
          blocks: [
            {
              kind: 'p',
              text: '获取当前密钥可用的模型列表,兼容 OpenAI 格式。',
            },
            { kind: 'endpoint', method: 'GET', path: '/v1/models' },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl "${baseUrl}/v1/models" \\\n  -H "Authorization: Bearer sk-xxxxxx"`,
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "object": "list",\n  "data": [\n    { "id": "gpt-4o", "object": "model", "created": 1700000000, "owned_by": "openai" },\n    { "id": "claude-3-5-sonnet", "object": "model", "created": 1700000000, "owned_by": "anthropic" }\n  ]\n}',
            },
            {
              kind: 'note',
              text: 'Gemini 原生列表使用 `GET /v1beta/models`;OpenAI 兼容列表也可用 `GET /v1beta/openai/models`。',
            },
          ],
        },
        {
          id: 'models-get',
          label: '获取单个模型',
          method: 'GET',
          blocks: [
            { kind: 'p', text: '获取指定模型的信息。' },
            { kind: 'endpoint', method: 'GET', path: '/v1/models/{model}' },
          ],
        },
      ],
    },
    {
      id: 'chat',
      label: '聊天',
      items: [
        {
          id: 'chat-openai',
          label: '原生 OpenAI 格式',
          method: 'POST',
          blocks: [
            { kind: 'p', text: 'OpenAI 兼容的对话补全接口,是最常用的入口。' },
            { kind: 'endpoint', method: 'POST', path: '/v1/chat/completions' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: '模型 ID',
                },
                {
                  name: 'messages',
                  type: 'object[]',
                  required: true,
                  desc: '对话消息数组,每项含 role(system/user/assistant/tool)与 content',
                },
                {
                  name: 'stream',
                  type: 'boolean',
                  required: false,
                  default: 'false',
                  desc: '是否流式返回(SSE)',
                },
                {
                  name: 'temperature',
                  type: 'number',
                  required: false,
                  default: '1',
                  desc: '采样温度 0~2',
                },
                {
                  name: 'top_p',
                  type: 'number',
                  required: false,
                  default: '1',
                  desc: '核采样',
                },
                {
                  name: 'max_tokens',
                  type: 'integer',
                  required: false,
                  desc: '最大生成 token 数',
                },
                {
                  name: 'tools',
                  type: 'object[]',
                  required: false,
                  desc: '可调用的函数/工具定义',
                },
                {
                  name: 'tool_choice',
                  type: 'string|object',
                  required: false,
                  desc: '工具选择策略',
                },
                {
                  name: 'response_format',
                  type: 'object',
                  required: false,
                  desc: '如 { "type": "json_object" }',
                },
                {
                  name: 'stop',
                  type: 'string|string[]',
                  required: false,
                  desc: '停止序列',
                },
                {
                  name: 'user',
                  type: 'string',
                  required: false,
                  desc: '终端用户标识',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/chat/completions" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "gpt-4o",\n    "messages": [\n      { "role": "system", "content": "你是一个乐于助人的助手" },\n      { "role": "user", "content": "用一句话介绍长城" }\n    ]\n  }'`,
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "id": "chatcmpl-xxx",\n  "object": "chat.completion",\n  "created": 1700000000,\n  "model": "gpt-4o",\n  "choices": [\n    {\n      "index": 0,\n      "message": { "role": "assistant", "content": "长城是中国古代规模最大的军事防御工程。" },\n      "finish_reason": "stop"\n    }\n  ],\n  "usage": { "prompt_tokens": 26, "completion_tokens": 18, "total_tokens": 44 }\n}',
            },
            {
              kind: 'note',
              text: '设置 `"stream": true` 后,响应为 SSE,逐块下发 `chat.completion.chunk`,以 `data: [DONE]` 结束。',
            },
          ],
        },
        {
          id: 'chat-claude',
          label: '原生 Claude 格式',
          method: 'POST',
          blocks: [
            { kind: 'p', text: 'Anthropic Claude Messages 格式。' },
            { kind: 'endpoint', method: 'POST', path: '/v1/messages' },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/messages" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "claude-3-5-sonnet",\n    "max_tokens": 1024,\n    "messages": [ { "role": "user", "content": "你好" } ]\n  }'`,
            },
          ],
        },
        {
          id: 'chat-responses',
          label: 'OpenAI Responses 格式',
          method: 'POST',
          blocks: [
            { kind: 'p', text: 'OpenAI Responses API 格式。' },
            { kind: 'endpoint', method: 'POST', path: '/v1/responses' },
          ],
        },
        {
          id: 'chat-gemini',
          label: '原生 Gemini 格式',
          method: 'POST',
          blocks: [
            { kind: 'p', text: 'Google Gemini 原生格式,路径含模型名与动作。' },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/v1beta/models/{model}:generateContent',
            },
          ],
        },
      ],
    },
    {
      id: 'completions',
      label: '补全',
      items: [
        {
          id: 'completions-openai',
          label: '原生 OpenAI 格式',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '传统文本补全接口(非对话),兼容 OpenAI 格式。' },
            { kind: 'endpoint', method: 'POST', path: '/v1/completions' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: '模型 ID',
                },
                {
                  name: 'prompt',
                  type: 'string|string[]',
                  required: true,
                  desc: '提示词',
                },
                {
                  name: 'max_tokens',
                  type: 'integer',
                  required: false,
                  default: '16',
                  desc: '最大生成 token 数',
                },
                {
                  name: 'temperature',
                  type: 'number',
                  required: false,
                  default: '1',
                  desc: '采样温度',
                },
                {
                  name: 'stream',
                  type: 'boolean',
                  required: false,
                  default: 'false',
                  desc: '是否流式',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/completions" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "model": "gpt-3.5-turbo-instruct", "prompt": "写一句诗:", "max_tokens": 32 }'`,
            },
          ],
        },
      ],
    },
    {
      id: 'embeddings',
      label: '嵌入',
      items: [
        {
          id: 'embeddings-openai',
          label: '原生 OpenAI 格式',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '将文本转换为向量,用于检索、聚类、相似度计算等。',
            },
            { kind: 'endpoint', method: 'POST', path: '/v1/embeddings' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: '嵌入模型 ID',
                },
                {
                  name: 'input',
                  type: 'string|string[]',
                  required: true,
                  desc: '待嵌入文本,支持批量',
                },
                {
                  name: 'encoding_format',
                  type: 'string',
                  required: false,
                  default: 'float',
                  desc: 'float 或 base64',
                },
                {
                  name: 'dimensions',
                  type: 'integer',
                  required: false,
                  desc: '输出维度(部分模型支持)',
                },
              ],
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "object": "list",\n  "data": [ { "object": "embedding", "index": 0, "embedding": [0.0023, -0.019, "..."] } ],\n  "model": "text-embedding-3-small",\n  "usage": { "prompt_tokens": 4, "total_tokens": 4 }\n}',
            },
          ],
        },
        {
          id: 'embeddings-gemini',
          label: '原生 Gemini 格式',
          method: 'POST',
          blocks: [
            { kind: 'p', text: 'Gemini 向量嵌入格式。' },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/v1/engines/{model}/embeddings',
            },
          ],
        },
      ],
    },
    {
      id: 'rerank',
      label: '重排序',
      items: [
        {
          id: 'rerank-doc',
          label: '文档重排序',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '根据查询对候选文档重新排序,常用于 RAG 精排。' },
            { kind: 'endpoint', method: 'POST', path: '/v1/rerank' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: '重排序模型 ID',
                },
                {
                  name: 'query',
                  type: 'string',
                  required: true,
                  desc: '查询语句',
                },
                {
                  name: 'documents',
                  type: 'string[]',
                  required: true,
                  desc: '候选文档列表',
                },
                {
                  name: 'top_n',
                  type: 'integer',
                  required: false,
                  desc: '返回排名前 N 条',
                },
                {
                  name: 'return_documents',
                  type: 'boolean',
                  required: false,
                  default: 'false',
                  desc: '是否回传文档原文',
                },
              ],
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "results": [\n    { "index": 0, "relevance_score": 0.98 },\n    { "index": 1, "relevance_score": 0.05 }\n  ],\n  "usage": { "total_tokens": 20 }\n}',
            },
          ],
        },
      ],
    },
    {
      id: 'moderations',
      label: '审查',
      items: [
        {
          id: 'moderations-openai',
          label: '原生 OpenAI 格式',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '检测文本是否违反内容安全策略。' },
            { kind: 'endpoint', method: 'POST', path: '/v1/moderations' },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "id": "modr-xxx",\n  "model": "omni-moderation-latest",\n  "results": [\n    { "flagged": false, "categories": { "violence": false }, "category_scores": { "violence": 0.0001 } }\n  ]\n}',
            },
            {
              kind: 'note',
              text: '内容审查是合规工具之一,不替代平台自身的安全治理义务与上游内容政策要求。',
            },
          ],
        },
      ],
    },
    {
      id: 'audio',
      label: '音频',
      items: [
        {
          id: 'audio-speech',
          label: '语音合成',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '文本转语音(TTS)。' },
            { kind: 'endpoint', method: 'POST', path: '/v1/audio/speech' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: 'TTS 模型 ID(如 tts-1)',
                },
                {
                  name: 'input',
                  type: 'string',
                  required: true,
                  desc: '要合成的文本',
                },
                {
                  name: 'voice',
                  type: 'string',
                  required: true,
                  desc: '音色(如 alloy)',
                },
                {
                  name: 'response_format',
                  type: 'string',
                  required: false,
                  default: 'mp3',
                  desc: 'mp3 / opus / aac / flac / wav',
                },
                {
                  name: 'speed',
                  type: 'number',
                  required: false,
                  default: '1.0',
                  desc: '语速 0.25~4.0',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/audio/speech" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "model": "tts-1", "input": "你好", "voice": "alloy" }' \\\n  --output speech.mp3`,
            },
            { kind: 'note', text: '成功时直接返回二进制音频流(非 JSON)。' },
          ],
        },
        {
          id: 'audio-transcriptions',
          label: '语音转写',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '语音识别(转写为同语种文本)。请求体为 `multipart/form-data`,字段:`file`(必填)、`model`(必填)、`language`、`prompt`、`response_format`、`temperature`。',
            },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/v1/audio/transcriptions',
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/audio/transcriptions" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -F file="@audio.mp3" \\\n  -F model="whisper-1"`,
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{ "text": "识别出的文本内容" }',
            },
          ],
        },
        {
          id: 'audio-translations',
          label: '语音翻译',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '语音识别并翻译为英文。字段同「语音转写」。' },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/v1/audio/translations',
            },
          ],
        },
      ],
    },
    {
      id: 'realtime',
      label: '实时语音',
      items: [
        {
          id: 'realtime-session',
          label: '实时会话',
          method: 'GET',
          blocks: [
            {
              kind: 'p',
              text: '基于 WebSocket 的实时音频/文本双向流接口,兼容 OpenAI Realtime。',
            },
            { kind: 'endpoint', method: 'GET', path: '/v1/realtime' },
            {
              kind: 'p',
              text: '使用 WebSocket 连接,`base_url` 的 http(s) 需替换为 ws(s),模型通过查询参数指定,鉴权用 Bearer 密钥:',
            },
            {
              kind: 'code',
              label: 'WebSocket',
              code: 'wss://YOUR_DOMAIN/v1/realtime?model=gpt-4o-realtime-preview\n\nHeader: Authorization: Bearer sk-xxxxxx',
            },
            {
              kind: 'note',
              text: '连接建立后按 Realtime 事件协议收发 `session.update`、`input_audio_buffer.append`、`response.create` 等事件。',
            },
          ],
        },
      ],
    },
    {
      id: 'unimplemented',
      label: '未实现',
      items: [
        {
          id: 'unimplemented-variations',
          label: '图像变体',
          method: 'POST',
          blocks: [
            { kind: 'note', text: '占位接口,当前返回 `501 Not Implemented`。' },
            { kind: 'endpoint', method: 'POST', path: '/v1/images/variations' },
          ],
        },
        {
          id: 'unimplemented-files',
          label: '文件(Files)',
          blocks: [
            { kind: 'note', text: '占位接口,当前返回 `501 Not Implemented`。' },
            {
              kind: 'table',
              head: ['方法', '路径'],
              rows: [
                ['GET / POST', '`/v1/files`'],
                ['GET / DELETE', '`/v1/files/{id}`'],
                ['GET', '`/v1/files/{id}/content`'],
              ],
            },
          ],
        },
        {
          id: 'unimplemented-finetunes',
          label: '微调(Fine-tuning)',
          blocks: [
            { kind: 'note', text: '占位接口,当前返回 `501 Not Implemented`。' },
            {
              kind: 'table',
              head: ['方法', '路径'],
              rows: [
                ['POST / GET', '`/v1/fine-tunes`'],
                ['GET', '`/v1/fine-tunes/{id}`'],
                ['POST', '`/v1/fine-tunes/{id}/cancel`'],
              ],
            },
          ],
        },
      ],
    },
  ],
})

const imageGroup = (baseUrl: string): DocGroup => ({
  id: 'images',
  superLabel: '图像',
  categories: [
    {
      id: 'img-gemini',
      label: '原生 Gemini 格式',
      items: [
        {
          id: 'img-gemini-native',
          label: 'Gemini 原生格式',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '通过 Gemini 原生 `generateContent` 生成图像,适用于 `gemini-2.5-flash-image`、`gemini-3-pro-image-preview`、`nano-banana-pro-preview` 等图像模型。',
            },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/v1beta/models/{model}:generateContent',
            },
            {
              kind: 'params',
              rows: [
                {
                  name: 'contents',
                  type: 'array',
                  required: true,
                  desc: '内容数组,parts 支持 `text` 与 `inline_data`(图生图垫图)',
                },
                {
                  name: 'generationConfig.responseModalities',
                  type: 'string[]',
                  required: false,
                  desc: '声明输出模态,含 `"IMAGE"` 才返回图片',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1beta/models/gemini-2.5-flash-image:generateContent" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "contents": [ { "role": "user", "parts": [ { "text": "画一只戴墨镜的柴犬" } ] } ],\n    "generationConfig": { "responseModalities": ["TEXT", "IMAGE"] }\n  }'`,
            },
            {
              kind: 'code',
              label: '响应',
              code: '{\n  "candidates": [\n    {\n      "content": {\n        "parts": [\n          { "inlineData": { "mimeType": "image/png", "data": "iVBORw0K..." } }\n        ]\n      }\n    }\n  ]\n}',
            },
          ],
        },
        {
          id: 'img-gemini-chat',
          label: 'OpenAI 聊天格式',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '用 OpenAI 兼容的 `chat/completions` 调用同一批 Gemini 图像模型;生成的图片在助手消息中返回。可在消息里带 `image_url` 做图生图。',
            },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/v1/chat/completions',
            },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: 'Gemini 图像模型(如 gemini-2.5-flash-image)',
                },
                {
                  name: 'messages',
                  type: 'array',
                  required: true,
                  desc: '对话消息;content 可含文本或 image_url',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/chat/completions" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "model": "gemini-2.5-flash-image", "messages": [ { "role": "user", "content": "画一只戴墨镜的柴犬" } ] }'`,
            },
          ],
        },
      ],
    },
    {
      id: 'img-openai',
      label: '原生 OpenAI 格式',
      items: [
        {
          id: 'img-openai-generations',
          label: '生成图像',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '根据文本提示生成图像。`model` 可为 `dall-e-3`、`gpt-image-1`、`imagen-4.0-generate-001`(映射至 Google Imagen)等。',
            },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/v1/images/generations',
            },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: '图像模型 ID(如 dall-e-3、gpt-image-1、imagen-4.0-generate-001)',
                },
                {
                  name: 'prompt',
                  type: 'string',
                  required: true,
                  desc: '图像描述',
                },
                {
                  name: 'n',
                  type: 'integer',
                  required: false,
                  default: '1',
                  desc: '生成数量',
                },
                {
                  name: 'size',
                  type: 'string',
                  required: false,
                  default: '1024x1024',
                  desc: '尺寸',
                },
                {
                  name: 'quality',
                  type: 'string',
                  required: false,
                  desc: '质量(standard/hd 等)',
                },
                {
                  name: 'response_format',
                  type: 'string',
                  required: false,
                  default: 'url',
                  desc: 'url 或 b64_json',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/images/generations" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "model": "dall-e-3", "prompt": "雪山下的湖泊,写实风格", "size": "1024x1024" }'`,
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "created": 1700000000,\n  "data": [ { "url": "https://.../image.png", "revised_prompt": "..." } ]\n}',
            },
          ],
        },
        {
          id: 'img-openai-edits',
          label: '编辑图像',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '基于原图与提示词进行编辑/局部重绘。请求体为 `multipart/form-data`;别名路径 `/v1/edits` 等价。',
            },
            { kind: 'endpoint', method: 'POST', path: '/v1/images/edits' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'image',
                  type: 'file',
                  required: true,
                  desc: '原始图像(PNG,必填)',
                },
                {
                  name: 'prompt',
                  type: 'string',
                  required: true,
                  desc: '编辑描述',
                },
                {
                  name: 'mask',
                  type: 'file',
                  required: false,
                  desc: '遮罩图,透明区域为待重绘部分',
                },
                {
                  name: 'model',
                  type: 'string',
                  required: false,
                  desc: '图像模型 ID(如 gpt-image-1、dall-e-2)',
                },
                {
                  name: 'n',
                  type: 'integer',
                  required: false,
                  default: '1',
                  desc: '生成数量',
                },
                {
                  name: 'size',
                  type: 'string',
                  required: false,
                  default: '1024x1024',
                  desc: '尺寸',
                },
                {
                  name: 'response_format',
                  type: 'string',
                  required: false,
                  default: 'url',
                  desc: 'url 或 b64_json',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/images/edits" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -F model="gpt-image-1" \\\n  -F image="@origin.png" \\\n  -F mask="@mask.png" \\\n  -F prompt="把背景换成星空"`,
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "created": 1700000000,\n  "data": [ { "url": "https://.../edited.png" } ]\n}',
            },
          ],
        },
      ],
    },
    {
      id: 'img-qwen',
      label: '通义千问 OpenAI 格式',
      items: [
        {
          id: 'img-qwen-generations',
          label: '生成图像',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '以 OpenAI 兼容格式调用通义千问 / 万相图像模型(如 `qwen-image`、`wan2.2-t2i-flash`、`z-image`)。',
            },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/v1/images/generations',
            },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: '模型 ID(如 qwen-image、wan2.2-t2i-flash、z-image)',
                },
                {
                  name: 'prompt',
                  type: 'string',
                  required: true,
                  desc: '图像描述',
                },
                {
                  name: 'n',
                  type: 'integer',
                  required: false,
                  default: '1',
                  desc: '生成数量',
                },
                {
                  name: 'size',
                  type: 'string',
                  required: false,
                  desc: '尺寸(如 1024x1024)',
                },
                {
                  name: 'negative_prompt',
                  type: 'string',
                  required: false,
                  desc: '反向提示词(WAN 系列支持)',
                },
                {
                  name: 'response_format',
                  type: 'string',
                  required: false,
                  default: 'url',
                  desc: 'url 或 b64_json',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/images/generations" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "model": "qwen-image", "prompt": "国风水墨,仙鹤与松树", "size": "1024x1024" }'`,
            },
          ],
        },
        {
          id: 'img-qwen-edits',
          label: '编辑图像',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '基于输入图与提示词编辑图像(如 `qwen-image-edit`)。请求体为 `multipart/form-data`,`image` 字段最多可传 2 张图(URL 或 base64)。',
            },
            { kind: 'endpoint', method: 'POST', path: '/v1/images/edits' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: '模型 ID(如 qwen-image-edit)',
                },
                {
                  name: 'image',
                  type: 'file',
                  required: true,
                  desc: '待编辑图,最多 2 张(URL 或 base64)',
                },
                {
                  name: 'prompt',
                  type: 'string',
                  required: true,
                  desc: '编辑描述',
                },
                {
                  name: 'n',
                  type: 'integer',
                  required: false,
                  default: '1',
                  desc: '生成数量',
                },
                {
                  name: 'response_format',
                  type: 'string',
                  required: false,
                  default: 'url',
                  desc: 'url 或 b64_json',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/images/edits" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -F model="qwen-image-edit" \\\n  -F image="@origin.png" \\\n  -F prompt="把服装改成红色旗袍"`,
            },
          ],
        },
      ],
    },
    {
      id: 'midjourney',
      label: 'Midjourney 格式',
      items: [
        {
          id: 'mj-overview',
          label: '概览',
          blocks: [
            {
              kind: 'p',
              text: 'Midjourney 兼容 midjourney-proxy 协议,采用异步任务模型:先调用 `submit/*` 提交任务拿到 `taskId`,再轮询 `GET /mj/task/{id}/fetch` 获取进度与图片结果。',
            },
            {
              kind: 'note',
              text: '可在路径前加运行模式,如 `/{mode}/mj/submit/imagine`(mode 取 `fast` / `turbo` / `relax`)。图片输入支持公网 URL 或 base64(`base64Array`)。可选 `notifyHook` 用于任务完成回调。',
            },
          ],
        },
        {
          id: 'mj-imagine',
          label: '文生图 Imagine',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '根据提示词生成四格图,可在提示词内附带 `--ar`、`--v` 等 MJ 参数。',
            },
            { kind: 'endpoint', method: 'POST', path: '/mj/submit/imagine' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'prompt',
                  type: 'string',
                  required: true,
                  desc: '提示词,可带 MJ 后缀参数',
                },
                {
                  name: 'base64Array',
                  type: 'string[]',
                  required: false,
                  desc: '垫图(图生图)的 base64 列表',
                },
                {
                  name: 'notifyHook',
                  type: 'string',
                  required: false,
                  desc: '任务完成回调地址',
                },
                {
                  name: 'state',
                  type: 'string',
                  required: false,
                  desc: '自定义透传状态',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/mj/submit/imagine" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "prompt": "a cyberpunk city at night --ar 16:9" }'`,
            },
            {
              kind: 'code',
              label: '响应',
              code: '{\n  "code": 1,\n  "description": "提交成功",\n  "result": "148xxxxxxxxx",\n  "properties": {}\n}',
            },
          ],
        },
        {
          id: 'mj-blend',
          label: '混图 Blend',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '将 2-5 张图融合为一张。' },
            { kind: 'endpoint', method: 'POST', path: '/mj/submit/blend' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'base64Array',
                  type: 'string[]',
                  required: true,
                  desc: '2-5 张图的 base64',
                },
                {
                  name: 'dimensions',
                  type: 'string',
                  required: false,
                  desc: '比例:PORTRAIT / SQUARE / LANDSCAPE',
                },
              ],
            },
          ],
        },
        {
          id: 'mj-describe',
          label: '图生文 Describe',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '上传图片,反推 4 条提示词。' },
            { kind: 'endpoint', method: 'POST', path: '/mj/submit/describe' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'base64',
                  type: 'string',
                  required: true,
                  desc: '图片 base64',
                },
              ],
            },
          ],
        },
        {
          id: 'mj-change',
          label: '变换 Change(放大/变体/重绘)',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '对已完成的 Imagine 任务做放大(UPSCALE)、变体(VARIATION)或重绘(REROLL)。',
            },
            { kind: 'endpoint', method: 'POST', path: '/mj/submit/change' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'taskId',
                  type: 'string',
                  required: true,
                  desc: '源任务 ID',
                },
                {
                  name: 'action',
                  type: 'string',
                  required: true,
                  desc: 'UPSCALE / VARIATION / REROLL',
                },
                {
                  name: 'index',
                  type: 'integer',
                  required: false,
                  desc: '1-4,选择第几张',
                },
              ],
            },
            {
              kind: 'note',
              text: '也可用 `POST /mj/submit/simple-change`,body `{ "content": "148xxxxxxxxx U1" }` 的简写形式。',
            },
          ],
        },
        {
          id: 'mj-action',
          label: '按钮动作 Action / Modal',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '触发返回结果中的按钮(如 U1/V1、Vary、Zoom、Pan 等);部分动作需再提交 Modal 填入内容。',
            },
            { kind: 'endpoint', method: 'POST', path: '/mj/submit/action' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'taskId',
                  type: 'string',
                  required: true,
                  desc: '源任务 ID',
                },
                {
                  name: 'customId',
                  type: 'string',
                  required: true,
                  desc: '按钮的 customId',
                },
              ],
            },
            { kind: 'endpoint', method: 'POST', path: '/mj/submit/modal' },
            {
              kind: 'note',
              text: 'Modal body:`{ taskId, prompt?, maskBase64? }`,用于 Inpaint / 自定义 Zoom 等二次输入。',
            },
          ],
        },
        {
          id: 'mj-shorten',
          label: '提示词分析 Shorten',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '分析提示词权重并给出精简建议。' },
            { kind: 'endpoint', method: 'POST', path: '/mj/submit/shorten' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'prompt',
                  type: 'string',
                  required: true,
                  desc: '待分析提示词',
                },
              ],
            },
          ],
        },
        {
          id: 'mj-edits',
          label: '局部重绘 Edits',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '基于遮罩对图像做局部编辑。' },
            { kind: 'endpoint', method: 'POST', path: '/mj/submit/edits' },
          ],
        },
        {
          id: 'mj-video',
          label: '视频 Video',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: 'Midjourney 视频生成任务,提交后同样通过 fetch 轮询结果。',
            },
            { kind: 'endpoint', method: 'POST', path: '/mj/submit/video' },
          ],
        },
        {
          id: 'mj-swap',
          label: '换脸 InsightFace Swap',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '将源人脸替换到目标图。' },
            { kind: 'endpoint', method: 'POST', path: '/mj/insight-face/swap' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'sourceBase64',
                  type: 'string',
                  required: true,
                  desc: '源人脸图 base64',
                },
                {
                  name: 'targetBase64',
                  type: 'string',
                  required: true,
                  desc: '目标图 base64',
                },
              ],
            },
          ],
        },
        {
          id: 'mj-upload',
          label: '上传图片',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '上传 base64 图片,返回可复用的图片地址。' },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/mj/submit/upload-discord-images',
            },
          ],
        },
        {
          id: 'mj-fetch',
          label: '任务查询',
          method: 'GET',
          blocks: [
            { kind: 'p', text: '按任务 ID 轮询进度、状态与图片结果。' },
            {
              kind: 'table',
              head: ['方法', '路径', '说明'],
              rows: [
                [
                  'GET',
                  '`/mj/task/{id}/fetch`',
                  '查询单个任务(status/progress/imageUrl)',
                ],
                ['GET', '`/mj/task/{id}/image-seed`', '获取任务图片 seed'],
                [
                  'POST',
                  '`/mj/task/list-by-condition`',
                  '按 `{ ids: [...] }` 批量查询',
                ],
                ['GET', '`/mj/image/{id}`', '拉取存储的图片字节'],
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl "${baseUrl}/mj/task/148xxxxxxxxx/fetch" \\\n  -H "Authorization: Bearer sk-xxxxxx"`,
            },
            {
              kind: 'code',
              label: '响应',
              code: '{\n  "id": "148xxxxxxxxx",\n  "status": "SUCCESS",\n  "progress": "100%",\n  "imageUrl": "https://.../grid.png",\n  "buttons": [ { "customId": "MJ::JOB::upsample::1::xxxx", "label": "U1" } ]\n}',
            },
          ],
        },
      ],
    },
  ],
})

const videoGroup = (baseUrl: string): DocGroup => ({
  id: 'video',
  superLabel: '视频',
  categories: [
    {
      id: 'video-seedance',
      label: 'Seedance 2.0 · 视频生成',
      items: [
        {
          id: 'seedance-overview',
          label: '概述与模型',
          blocks: [
            {
              kind: 'p',
              text: 'Seedance 2.0(即梦 S2.0)是火山方舟提供的 AI 视频生成模型,支持文生视频、图生视频、多模态参考生视频,并可配合私域素材库实现虚拟人像的稳定生成。本平台以**官方 Ark 格式**对外分发,统一 Bearer 鉴权,下游只需一个密钥。',
            },
            {
              kind: 'cards',
              cards: [
                {
                  title: '文生 / 图生视频',
                  desc: '文本、首帧/首尾帧图片驱动视频生成。',
                },
                {
                  title: '多模态参考',
                  desc: '图片 + 视频 + 音频混合参考,全新 / 编辑 / 延长视频。',
                },
                {
                  title: '私域素材库',
                  desc: '上传虚拟人像素材,生成时用 asset:// 引用。',
                },
              ],
            },
            {
              kind: 'table',
              head: ['Model ID', '说明'],
              rows: [
                [
                  '`doubao-seedance-2-0-260128`',
                  'Seedance 2.0 标准版(支持全部分辨率)',
                ],
                [
                  '`doubao-seedance-2-0-fast-260128`',
                  'Seedance 2.0 Fast(更快,不支持 1080p)',
                ],
              ],
            },
          ],
        },
        {
          id: 'seedance-create',
          label: '创建视频任务',
          method: 'POST',
          blocks: [
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/ark/api/v3/contents/generations/tasks',
            },
            { kind: 'h3', text: '文生视频' },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/ark/api/v3/contents/generations/tasks" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "doubao-seedance-2-0-260128",\n    "content": [\n      { "type": "text", "text": "一只猫在阳光下打哈欠,温暖光线,4K画质" }\n    ],\n    "duration": 5,\n    "resolution": "720p",\n    "ratio": "16:9",\n    "generate_audio": true,\n    "watermark": false\n  }'`,
            },
            { kind: 'h3', text: '图生视频(首帧 / 首尾帧)' },
            {
              kind: 'p',
              text: '通过 `role` 指定图片用途:`first_frame`(首帧)、`last_frame`(尾帧)。',
            },
            {
              kind: 'code',
              label: 'JSON',
              code: '{\n  "model": "doubao-seedance-2-0-260128",\n  "content": [\n    { "type": "text", "text": "从白天过渡到黄昏的城市街景" },\n    { "type": "image_url", "image_url": { "url": "https://example.com/start.jpg" }, "role": "first_frame" },\n    { "type": "image_url", "image_url": { "url": "https://example.com/end.jpg" }, "role": "last_frame" }\n  ],\n  "duration": 5\n}',
            },
            { kind: 'h3', text: '多模态参考(图片 + 视频 + 音频)' },
            {
              kind: 'p',
              text: '支持图片(0-9) + 视频(0-3) + 音频(0-3),role 取 `reference_image` / `reference_video` / `reference_audio`。',
            },
            {
              kind: 'code',
              label: 'JSON',
              code: '{\n  "model": "doubao-seedance-2-0-260128",\n  "content": [\n    { "type": "text", "text": "图片1中的人物穿着图片2的服装,在视频1场景中行走,配合音频1的背景音乐" },\n    { "type": "image_url", "image_url": { "url": "https://example.com/person.jpg" }, "role": "reference_image" },\n    { "type": "image_url", "image_url": { "url": "https://example.com/clothes.jpg" }, "role": "reference_image" },\n    { "type": "video_url", "video_url": { "url": "https://example.com/scene.mp4" }, "role": "reference_video" },\n    { "type": "audio_url", "audio_url": { "url": "https://example.com/bgm.mp3" }, "role": "reference_audio" }\n  ],\n  "generate_audio": true,\n  "ratio": "16:9",\n  "duration": 11\n}',
            },
            {
              kind: 'note',
              text: '提示词中用「图片1」「视频1」「音频1」指代素材,序号为同类素材在请求体中的出现顺序,不要直接写 Asset ID。',
            },
            {
              kind: 'code',
              label: '返回',
              code: '{ "id": "task_xxxxxxxxxxxxxxxx" }',
            },
          ],
        },
        {
          id: 'seedance-query',
          label: '查询视频任务',
          method: 'GET',
          blocks: [
            {
              kind: 'endpoint',
              method: 'GET',
              path: '/ark/api/v3/contents/generations/tasks/{id}',
            },
            {
              kind: 'code',
              label: '响应(成功)',
              code: '{\n  "id": "task_xxxxxxxxxxxxxxxx",\n  "model": "doubao-seedance-2-0-260128",\n  "status": "succeeded",\n  "content": { "video_url": "https://.../xxx.mp4?..." },\n  "usage": { "completion_tokens": 50638, "total_tokens": 50638 },\n  "seed": 37072,\n  "resolution": "720p",\n  "ratio": "16:9",\n  "duration": 5,\n  "framespersecond": 24,\n  "generate_audio": true\n}',
            },
            {
              kind: 'code',
              label: '响应(失败)',
              code: '{\n  "id": "task_xxxxxxxxxxxxxxxx",\n  "status": "failed",\n  "error": {\n    "code": "OutputVideoSensitiveContentDetected",\n    "message": "The request failed because the output video may contain sensitive information."\n  }\n}',
            },
            { kind: 'note', text: 'video_url 有效期约 24 小时,请及时转存。' },
          ],
        },
        {
          id: 'seedance-params',
          label: '请求参数',
          blocks: [
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: '模型 ID',
                },
                {
                  name: 'content',
                  type: 'object[]',
                  required: true,
                  desc: '输入内容(文本 / 图片 / 视频 / 音频)',
                },
                {
                  name: 'duration',
                  type: 'integer',
                  required: false,
                  default: '5',
                  desc: '时长(秒),支持 4-15 或 -1(智能)',
                },
                {
                  name: 'resolution',
                  type: 'string',
                  required: false,
                  default: '720p',
                  desc: '480p / 720p / 1080p',
                },
                {
                  name: 'ratio',
                  type: 'string',
                  required: false,
                  default: 'adaptive',
                  desc: '16:9 / 4:3 / 1:1 / 3:4 / 9:16 / 21:9 / adaptive',
                },
                {
                  name: 'generate_audio',
                  type: 'boolean',
                  required: false,
                  default: 'true',
                  desc: '是否生成音频',
                },
                {
                  name: 'seed',
                  type: 'integer',
                  required: false,
                  default: '-1',
                  desc: '随机种子,-1 为随机',
                },
                {
                  name: 'watermark',
                  type: 'boolean',
                  required: false,
                  default: 'false',
                  desc: '是否加水印',
                },
                {
                  name: 'safety_identifier',
                  type: 'string',
                  required: false,
                  desc: '终端用户标识,用于内容溯源(建议哈希)',
                },
                {
                  name: 'callback_url',
                  type: 'string',
                  required: false,
                  desc: '任务状态变化回调地址',
                },
              ],
            },
          ],
        },
        {
          id: 'seedance-status',
          label: '任务状态',
          blocks: [
            {
              kind: 'table',
              head: ['status', '说明'],
              rows: [
                ['`queued`', '排队中'],
                ['`running`', '生成中'],
                ['`succeeded`', '成功,可获取 video_url'],
                ['`failed`', '失败,查看 error'],
                ['`expired`', '超时'],
                ['`cancelled`', '已取消'],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'video-asset',
      label: 'Seedance 2.0 · 私域素材库',
      items: [
        {
          id: 'asset-flow',
          label: '入库流程',
          blocks: [
            {
              kind: 'p',
              text: '私域素材库用于存放虚拟人像(AIGC)素材,入库后可在视频生成中通过 `asset://` 引用。整体流程:',
            },
            {
              kind: 'code',
              label: 'Flow',
              code: 'Step 1: CreateAssetGroup              -> group-id\nStep 2: CreateAsset (group-id + 图片URL) -> asset-id\nStep 3: GetAsset 轮询                  -> Status=Active\nStep 4: 视频生成中使用 asset://<asset-id>',
            },
            {
              kind: 'note',
              text: '素材库接口与视频生成共用同一个 API 密钥,签名由平台内部完成,下游无需关心 AK/SK。',
            },
          ],
        },
        {
          id: 'asset-create-group',
          label: 'CreateAssetGroup',
          method: 'POST',
          blocks: [
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/ark/?Action=CreateAssetGroup&Version=2024-01-01',
            },
            {
              kind: 'code',
              label: '请求',
              code: '{\n  "Name": "我的虚拟角色",\n  "Description": "用于短视频制作的虚拟人像",\n  "GroupType": "AIGC",\n  "ProjectName": "default"\n}',
            },
            {
              kind: 'code',
              label: '返回',
              code: '{ "Id": "group-20260519xxxxxx-xxxxx" }',
            },
          ],
        },
        {
          id: 'asset-create',
          label: 'CreateAsset',
          method: 'POST',
          blocks: [
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/ark/?Action=CreateAsset&Version=2024-01-01',
            },
            {
              kind: 'p',
              text: '仅支持公网 URL,不支持 base64。`AssetType` 支持 Image / Video / Audio。',
            },
            {
              kind: 'code',
              label: '请求',
              code: '{\n  "GroupId": "group-20260519xxxxxx-xxxxx",\n  "URL": "https://example.com/avatar.jpg",\n  "AssetType": "Image",\n  "Name": "角色全身照",\n  "ProjectName": "default"\n}',
            },
            {
              kind: 'code',
              label: '返回',
              code: '{ "Id": "asset-20260519xxxxxx-xxxxx" }',
            },
          ],
        },
        {
          id: 'asset-get',
          label: 'GetAsset',
          method: 'POST',
          blocks: [
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/ark/?Action=GetAsset&Version=2024-01-01',
            },
            {
              kind: 'code',
              label: '请求',
              code: '{ "Id": "asset-xxxxx", "ProjectName": "default" }',
            },
            {
              kind: 'code',
              label: '返回',
              code: '{\n  "Id": "asset-xxx",\n  "Status": "Active",\n  "AssetType": "Image",\n  "GroupId": "group-xxx",\n  "URL": "https://.../...",\n  "ProjectName": "default"\n}',
            },
            {
              kind: 'note',
              text: 'Status:Processing(处理中)-> Active(可用)/ Failed(失败)。',
            },
          ],
        },
        {
          id: 'asset-manage',
          label: '素材管理接口',
          blocks: [
            {
              kind: 'p',
              text: '全部通过 `POST /ark/?Action={Action}&Version=2024-01-01` 调用,请求体为对应 Action 的 JSON。',
            },
            {
              kind: 'table',
              head: ['Action', '说明'],
              rows: [
                ['`CreateAssetGroup`', '创建素材组'],
                ['`CreateAsset`', '上传素材(异步)'],
                ['`GetAsset`', '查询单个素材'],
                ['`ListAssets`', '查询素材列表'],
                ['`ListAssetGroups`', '查询素材组列表'],
                ['`GetAssetGroup`', '查询单个素材组'],
                ['`UpdateAsset` / `UpdateAssetGroup`', '更新素材 / 素材组'],
                ['`DeleteAsset` / `DeleteAssetGroup`', '删除素材 / 素材组'],
              ],
            },
          ],
        },
        {
          id: 'asset-use',
          label: '在生成中引用素材',
          blocks: [
            {
              kind: 'p',
              text: '素材 Status 变为 Active 后,在视频生成请求里用 `asset://<asset-id>` 作为图片 URL:',
            },
            {
              kind: 'code',
              label: 'JSON',
              code: '{\n  "model": "doubao-seedance-2-0-260128",\n  "content": [\n    { "type": "text", "text": "图片1中的虚拟人像微笑着走向镜头" },\n    { "type": "image_url", "image_url": { "url": "asset://asset-20260318071009-xxxxx" }, "role": "reference_image" }\n  ],\n  "duration": 5\n}',
            },
          ],
        },
      ],
    },
    {
      id: 'video-sora',
      label: 'Sora / OpenAI 格式',
      items: [
        {
          id: 'sora-create-form',
          label: '创建视频 · 表单',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: 'OpenAI 兼容的视频生成(Sora 风格,multipart 表单提交)。',
            },
            { kind: 'endpoint', method: 'POST', path: '/v1/videos' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: '模型 / 风格 ID',
                },
                {
                  name: 'prompt',
                  type: 'string',
                  required: false,
                  desc: '文本描述提示词',
                },
                {
                  name: 'input_reference',
                  type: 'file/string',
                  required: false,
                  desc: '图片输入(文件 / URL)',
                },
                {
                  name: 'seconds',
                  type: 'string',
                  required: false,
                  default: '4',
                  desc: '视频时长(秒)',
                },
                {
                  name: 'size',
                  type: 'string',
                  required: false,
                  default: '720x1280',
                  desc: '尺寸,如 1280x720、1792x1024',
                },
                {
                  name: 'seed',
                  type: 'integer',
                  required: false,
                  desc: '随机种子',
                },
                {
                  name: 'n',
                  type: 'integer',
                  required: false,
                  desc: '生成数量',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/videos" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -F model="sora-2" \\\n  -F prompt="海边日出的延时摄影" \\\n  -F seconds="4" \\\n  -F size="1280x720"`,
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "id": "task_xxxxxxxx",\n  "object": "video",\n  "model": "sora-2",\n  "status": "queued",\n  "progress": 0,\n  "created_at": 1700000000\n}',
            },
          ],
        },
        {
          id: 'sora-create-json',
          label: '创建视频 · JSON',
          method: 'POST',
          blocks: [
            { kind: 'p', text: 'JSON 提交方式,适合图生/多图参考视频。' },
            { kind: 'endpoint', method: 'POST', path: '/v1/video/generations' },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model',
                  type: 'string',
                  required: true,
                  desc: '模型 ID',
                },
                {
                  name: 'prompt',
                  type: 'string',
                  required: true,
                  desc: '文本描述',
                },
                {
                  name: 'image',
                  type: 'string',
                  required: false,
                  desc: '首帧图片 URL(图生视频)',
                },
                {
                  name: 'images',
                  type: 'string[]',
                  required: false,
                  desc: '多图参考',
                },
                { name: 'size', type: 'string', required: false, desc: '尺寸' },
                {
                  name: 'duration',
                  type: 'integer',
                  required: false,
                  desc: '时长(秒)',
                },
                {
                  name: 'metadata',
                  type: 'object',
                  required: false,
                  desc: '透传给上游的扩展参数',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/v1/video/generations" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "model": "sora-2", "prompt": "雨中的东京街头", "size": "720x1280", "duration": 5 }'`,
            },
          ],
        },
        {
          id: 'sora-query',
          label: '查询任务状态',
          method: 'GET',
          blocks: [
            { kind: 'endpoint', method: 'GET', path: '/v1/videos/{task_id}' },
            {
              kind: 'endpoint',
              method: 'GET',
              path: '/v1/video/generations/{task_id}',
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "id": "task_xxxxxxxx",\n  "object": "video",\n  "status": "completed",\n  "progress": 100,\n  "seconds": "5",\n  "completed_at": 1700000050\n}',
            },
            {
              kind: 'table',
              head: ['status', '说明'],
              rows: [
                ['`queued`', '排队中'],
                ['`in_progress`', '生成中'],
                ['`completed`', '成功'],
                ['`failed`', '失败'],
              ],
            },
          ],
        },
        {
          id: 'sora-content',
          label: '下载视频内容',
          method: 'GET',
          blocks: [
            {
              kind: 'p',
              text: '任务完成后,通过该接口获取视频二进制内容(平台代理下载)。',
            },
            {
              kind: 'endpoint',
              method: 'GET',
              path: '/v1/videos/{task_id}/content',
            },
          ],
        },
        {
          id: 'sora-remix',
          label: '视频改写(Remix)',
          method: 'POST',
          blocks: [
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/v1/videos/{video_id}/remix',
            },
            {
              kind: 'code',
              label: '请求',
              code: '{ "prompt": "在原视频基础上增加落日氛围" }',
            },
          ],
        },
      ],
    },
    {
      id: 'video-kling',
      label: 'Kling 格式',
      items: [
        {
          id: 'kling-text2video',
          label: '文生视频',
          method: 'POST',
          blocks: [
            { kind: 'p', text: '可灵(Kling)原生文生视频。' },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/kling/v1/videos/text2video',
            },
            {
              kind: 'params',
              rows: [
                {
                  name: 'model_name',
                  type: 'string',
                  required: false,
                  default: 'kling-v1',
                  desc: '模型(kling-v1 / kling-v1-6 / kling-v2-master)',
                },
                {
                  name: 'prompt',
                  type: 'string',
                  required: true,
                  desc: '正向提示词',
                },
                {
                  name: 'negative_prompt',
                  type: 'string',
                  required: false,
                  desc: '负向提示词',
                },
                {
                  name: 'cfg_scale',
                  type: 'number',
                  required: false,
                  default: '0.5',
                  desc: '自由度 0~1',
                },
                {
                  name: 'mode',
                  type: 'string',
                  required: false,
                  default: 'std',
                  desc: 'std(标准)/ pro(高品质)',
                },
                {
                  name: 'aspect_ratio',
                  type: 'string',
                  required: false,
                  desc: '16:9 / 9:16 / 1:1',
                },
                {
                  name: 'duration',
                  type: 'string',
                  required: false,
                  default: '5',
                  desc: '时长(秒)',
                },
                {
                  name: 'camera_control',
                  type: 'object',
                  required: false,
                  desc: '运镜控制',
                },
                {
                  name: 'callback_url',
                  type: 'string',
                  required: false,
                  desc: '回调地址',
                },
              ],
            },
            {
              kind: 'code',
              label: 'cURL',
              code: `curl -X POST "${baseUrl}/kling/v1/videos/text2video" \\\n  -H "Authorization: Bearer sk-xxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "model_name": "kling-v1", "prompt": "一只熊猫在竹林里吃竹子", "duration": "5", "aspect_ratio": "16:9" }'`,
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "code": 0,\n  "message": "success",\n  "request_id": "xxx",\n  "data": { "task_id": "xxxxxxxx", "task_status": "submitted" }\n}',
            },
          ],
        },
        {
          id: 'kling-image2video',
          label: '图生视频',
          method: 'POST',
          blocks: [
            {
              kind: 'p',
              text: '在文生视频参数基础上增加:`image`(首帧图,URL 或 base64)、`image_tail`(尾帧图)、`static_mask`、`dynamic_masks`。',
            },
            {
              kind: 'endpoint',
              method: 'POST',
              path: '/kling/v1/videos/image2video',
            },
          ],
        },
        {
          id: 'kling-query',
          label: '查询任务状态',
          method: 'GET',
          blocks: [
            {
              kind: 'endpoint',
              method: 'GET',
              path: '/kling/v1/videos/text2video/{task_id}',
            },
            {
              kind: 'endpoint',
              method: 'GET',
              path: '/kling/v1/videos/image2video/{task_id}',
            },
            {
              kind: 'code',
              label: '响应 200',
              code: '{\n  "code": 0,\n  "data": {\n    "task_id": "xxxxxxxx",\n    "task_status": "succeed",\n    "task_result": { "videos": [ { "id": "v1", "url": "https://.../out.mp4", "duration": "5" } ] }\n  }\n}',
            },
            {
              kind: 'table',
              head: ['task_status', '说明'],
              rows: [
                ['`submitted`', '已提交'],
                ['`processing`', '处理中'],
                ['`succeed`', '成功'],
                ['`failed`', '失败'],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'video-ref',
      label: 'Seedance · 参考',
      items: [
        {
          id: 'video-ref-errors',
          label: '错误码与内容安全',
          blocks: [
            { kind: 'p', text: '当输入或输出触发安全检测时,会返回对应错误码:' },
            {
              kind: 'table',
              head: ['error.code', '说明'],
              rows: [
                ['`InputTextSensitiveContentDetected`', '输入文本含敏感信息'],
                ['`InputImageSensitiveContentDetected`', '输入图片敏感'],
                ['`InputVideoSensitiveContentDetected`', '输入视频敏感'],
                ['`OutputVideoSensitiveContentDetected`', '生成视频含敏感信息'],
                ['`*.PolicyViolation`', '违反平台规定'],
              ],
            },
            {
              kind: 'note',
              text: '遇到 429(TooManyRequests)请降低请求频率,并注意模型的 RPM / TPM 限制。',
            },
          ],
        },
        {
          id: 'video-ref-resolution',
          label: '分辨率对照',
          blocks: [
            {
              kind: 'table',
              head: ['分辨率', '16:9', '1:1', '9:16'],
              rows: [
                ['480p', '864×496', '640×640', '496×864'],
                ['720p', '1280×720', '960×960', '720×1280'],
                ['1080p', '1920×1080', '1440×1440', '1080×1920'],
              ],
            },
            {
              kind: 'note',
              text: 'Seedance 2.0 Fast 不支持 1080p;标准版支持全部分辨率。',
            },
          ],
        },
        {
          id: 'video-ref-best',
          label: '最佳实践',
          blocks: [
            {
              kind: 'list',
              items: [
                '时长设为 -1,让模型自动选择合适时长。',
                '宽高比设为 adaptive,自动适配输入素材。',
                '提示词:中文 ≤ 500 字、英文 ≤ 1000 词,过长会丢失细节。',
                '有声视频:对话部分用双引号包裹,如 男人说:"你好"。',
                '多素材引用:用「图1」「图2」精确指代。',
                '真人素材:含真人人脸的图片**不能作为外部 URL 直接传入**(会触发 `InputImageSensitiveContentDetected`)。需先通过素材库 `CreateAsset` 入库,再用 `asset://` 引用即可正常生成,**无需活体认证**。',
                'video_url 有效期 24h、Asset URL 有效期 12h,请及时转存。',
              ],
            },
          ],
        },
      ],
    },
  ],
})

const referenceGroup = (baseUrl: string): DocGroup => ({
  id: 'reference',
  superLabel: '参考',
  categories: [
    {
      id: 'ref-sdk',
      label: 'SDK 快速接入',
      blocks: [
        {
          kind: 'p',
          text: '由于接口兼容 OpenAI 格式,可直接使用官方 OpenAI SDK,只需把 `base_url` 指向本站、`api_key` 换成你的令牌。',
        },
        {
          kind: 'code',
          label: 'Python',
          code: `from openai import OpenAI\n\nclient = OpenAI(\n    api_key="sk-xxxxxx",\n    base_url="${baseUrl}/v1",\n)\n\nresp = client.chat.completions.create(\n    model="gpt-4o",\n    messages=[{"role": "user", "content": "你好"}],\n)\nprint(resp.choices[0].message.content)`,
        },
        {
          kind: 'code',
          label: 'Node.js',
          code: `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: "sk-xxxxxx",\n  baseURL: "${baseUrl}/v1",\n});\n\nconst resp = await client.chat.completions.create({\n  model: "gpt-4o",\n  messages: [{ role: "user", content: "你好" }],\n});\nconsole.log(resp.choices[0].message.content);`,
        },
      ],
    },
    {
      id: 'ref-billing',
      label: '计费与配额',
      blocks: [
        {
          kind: 'p',
          text: '平台以**配额(quota)**计量,调用消耗按下式换算,分组倍率由你所在的用户分组决定:',
        },
        {
          kind: 'code',
          label: '计费公式',
          code: '消耗配额 = 用量(tokens 或计费单元) × 模型倍率 × 分组倍率',
        },
        {
          kind: 'list',
          items: [
            '文本类接口(聊天/补全/嵌入等)按输入与输出 token 计费。',
            '视频 / 图像 / 音频等任务类接口按上游返回的计费单元(如 total_tokens)换算。',
            '可在 **控制台 → 日志** 查看每次调用的实际消耗与倍率。',
          ],
        },
      ],
    },
    {
      id: 'ref-limits',
      label: '速率限制',
      blocks: [
        {
          kind: 'p',
          text: '为保障稳定性,接口存在 RPM(每分钟请求数)与 TPM(每分钟 token 数)限制。超限时返回 `429`,请指数退避后重试。',
        },
        {
          kind: 'note',
          text: '不同模型 / 分组的限额不同,可在控制台查看你当前分组的限额。批量任务建议控制并发。',
        },
      ],
    },
  ],
})

export const buildDocGroups = (
  baseUrl: string,
  lang: DocLang = 'zh'
): DocGroup[] => [
  localizeGroup(startGroup(baseUrl), lang),
  buildGuidesGroup(baseUrl, lang),
  buildToolsGroup(baseUrl, lang),
  localizeGroup(aiGroup(baseUrl), lang),
  localizeGroup(imageGroup(baseUrl), lang),
  localizeGroup(videoGroup(baseUrl), lang),
  localizeGroup(referenceGroup(baseUrl), lang),
  buildFaqGroup(baseUrl, lang),
]

const codeFenceLang = (label?: string): string => {
  const l = (label || '').toLowerCase()
  if (
    l.includes('json') ||
    l.includes('响应') ||
    l.includes('成功') ||
    l.includes('失败') ||
    l.includes('response') ||
    l.includes('success') ||
    l.includes('failure') ||
    l.includes('request')
  ) {
    return 'json'
  }
  if (l.includes('curl')) return 'bash'
  if (l.includes('python')) return 'python'
  if (l.includes('node')) return 'javascript'
  if (l.includes('header')) return 'http'
  return ''
}

const mdCell = (text: string): string =>
  typeof text === 'string'
    ? text.replaceAll('|', '\\|').replaceAll('\n', ' ')
    : text

const blocksToMarkdown = (
  blocks: DocBlock[] | undefined,
  lines: string[],
  lang: DocLang
): void => {
  ;(blocks || []).forEach((b) => {
    switch (b.kind) {
      case 'p':
        lines.push(b.text, '')
        break
      case 'note':
        lines.push(`> ${b.text}`, '')
        break
      case 'h3':
        lines.push(`#### ${b.text}`, '')
        break
      case 'endpoint':
        lines.push('```http', `${b.method} ${b.path}`, '```', '')
        break
      case 'code':
        if (b.label) lines.push(`**${b.label}**`, '')
        lines.push(`\`\`\`${codeFenceLang(b.label)}`, b.code, '```', '')
        break
      case 'params': {
        const requiredLabel = lang === 'zh' ? '是' : 'Yes'
        const optionalLabel = lang === 'zh' ? '否' : 'No'
        lines.push(
          lang === 'zh'
            ? '| 参数 | 类型 | 必填 | 默认 | 说明 |'
            : '| Parameter | Type | Required | Default | Description |'
        )
        lines.push('| --- | --- | --- | --- | --- |')
        b.rows.forEach((r) =>
          lines.push(
            `| \`${r.name}\` | ${r.type} | ${r.required ? requiredLabel : optionalLabel} | ${r.default || '-'} | ${mdCell(r.desc)} |`
          )
        )
        lines.push('')
        break
      }
      case 'table':
        lines.push(`| ${b.head.join(' | ')} |`)
        lines.push(`| ${b.head.map(() => '---').join(' | ')} |`)
        b.rows.forEach((row) =>
          lines.push(`| ${row.map((c) => mdCell(c)).join(' | ')} |`)
        )
        lines.push('')
        break
      case 'list':
        b.items.forEach((it) => lines.push(`- ${it}`))
        lines.push('')
        break
      case 'cards':
        b.cards.forEach((c) =>
          lines.push(`- **${c.title}**${lang === 'zh' ? '：' : ': '}${c.desc}`)
        )
        lines.push('')
        break
      default:
        break
    }
  })
}

// Serialize a single category (the currently viewed doc "route") to Markdown.
export const buildCategoryMarkdown = (
  baseUrl: string,
  groupId: string,
  catId: string,
  lang: DocLang = 'zh'
): string => {
  const groups = buildDocGroups(baseUrl, lang)
  const group = groups.find((g) => g.id === groupId)
  const cat = group?.categories.find((c) => c.id === catId)
  if (!cat) return ''
  const lines = [`# ${cat.label}`, '', `base_url: \`${baseUrl}\``, '']
  if (cat.items) {
    cat.items.forEach((item) => {
      lines.push(
        `## ${item.label}${item.method ? ` \`${item.method}\`` : ''}`,
        ''
      )
      blocksToMarkdown(item.blocks, lines, lang)
    })
  } else {
    blocksToMarkdown(cat.blocks, lines, lang)
  }
  return `${lines
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()}\n`
}
