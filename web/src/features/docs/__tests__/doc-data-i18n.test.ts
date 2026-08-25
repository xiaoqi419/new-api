/*
Copyright (C) 2026 QuantumNous

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
import { describe, expect, test } from 'vitest'

import {
  buildCategoryMarkdown,
  buildDocGroups,
  type DocBlock,
  type DocGroup,
} from '../doc-data'

const baseUrl = 'https://gateway.example.test'
const HAN = /\p{Script=Han}/u

function visibleStrings(groups: DocGroup[]): string[] {
  const values: string[] = []

  for (const group of groups) {
    values.push(group.superLabel)
    for (const category of group.categories) {
      values.push(category.label)
      const sections = category.items ?? [category]
      for (const section of sections) {
        values.push(section.label)
        collectBlocks(section.blocks, values)
      }
    }
  }

  return values
}

function collectBlocks(blocks: DocBlock[] | undefined, values: string[]): void {
  for (const block of blocks ?? []) {
    switch (block.kind) {
      case 'p':
      case 'note':
      case 'h3':
        values.push(block.text)
        break
      case 'code':
        // The presentation label is localizable; raw request/response payloads are not.
        if (block.label) values.push(block.label)
        break
      case 'params':
        values.push(...block.rows.map((row) => row.desc))
        break
      case 'table':
        values.push(...block.head, ...block.rows.flat())
        break
      case 'list':
        values.push(...block.items)
        break
      case 'cards':
        values.push(...block.cards.flatMap((card) => [card.title, card.desc]))
        break
      case 'endpoint':
        break
    }
  }
}

function protocolValues(groups: DocGroup[]): string[] {
  const values: string[] = []

  for (const group of groups) {
    for (const category of group.categories) {
      const sections = category.items ?? [category]
      for (const section of sections) {
        for (const block of section.blocks ?? []) {
          if (block.kind === 'endpoint') {
            values.push(`${block.method} ${block.path}`)
          }
          if (block.kind === 'code') values.push(block.code)
          if (block.kind === 'params') {
            values.push(
              ...block.rows.map(
                (row) =>
                  `${row.name}|${row.type}|${row.default ?? ''}|${row.required ?? false}`
              )
            )
          }
        }
      }
    }
  }

  return values
}

describe('docs data localization', () => {
  test('uses complete English prose for every visible field outside raw code samples', () => {
    const english = visibleStrings(buildDocGroups(baseUrl, 'en'))
    const unexpectedChinese = english.filter((value) => HAN.test(value))

    expect(unexpectedChinese).toEqual([])
  })

  test('keeps representative Chinese documentation content for the Chinese tree', () => {
    const groups = buildDocGroups(baseUrl, 'zh')
    const representativeContent = [
      {
        id: 'start',
        label: '开始',
        prose:
          '本平台是一个统一的 AI API 网关,聚合多家上游模型服务,并以 **OpenAI / Claude / Gemini 兼容格式** 对外分发。下游只需一个 API 密钥即可调用聊天、补全、嵌入、重排序、审查、音频、图像、视频等能力,无需分别对接各上游厂商。',
      },
      {
        id: 'guides',
        label: '指南',
        prose:
          '只需三步即可接入:创建令牌、选择兼容协议、发起第一个请求。全站以 **OpenAI / Claude / Gemini 兼容格式** 分发,一个令牌即可调用全部模型。',
      },
      {
        id: 'tools',
        label: '工具接入',
        prose: 'Anthropic 官方命令行编程工具,通过 Claude 兼容协议接入。',
      },
      {
        id: 'ai',
        label: 'AI 模型接口',
        prose: '获取当前密钥可用的模型列表,兼容 OpenAI 格式。',
      },
      {
        id: 'images',
        label: '图像',
        prose:
          '通过 Gemini 原生 `generateContent` 生成图像,适用于 `gemini-2.5-flash-image`、`gemini-3-pro-image-preview`、`nano-banana-pro-preview` 等图像模型。',
      },
      {
        id: 'video',
        label: '视频',
        prose:
          'Seedance 2.0(即梦 S2.0)是火山方舟提供的 AI 视频生成模型,支持文生视频、图生视频、多模态参考生视频,并可配合私域素材库实现虚拟人像的稳定生成。本平台以**官方 Ark 格式**对外分发,统一 Bearer 鉴权,下游只需一个密钥。',
      },
      {
        id: 'reference',
        label: '参考',
        prose:
          '由于接口兼容 OpenAI 格式,可直接使用官方 OpenAI SDK,只需把 `base_url` 指向本站、`api_key` 换成你的令牌。',
      },
      {
        id: 'faq',
        label: '常见问题',
        prose:
          '部分功能或部分模型可能需要完成实名认证,用于保护账户安全与满足合规要求。',
      },
    ]

    for (const expectation of representativeContent) {
      const group = groups.find((item) => item.id === expectation.id)
      expect(group?.superLabel).toBe(expectation.label)
      expect(visibleStrings(group ? [group] : [])).toContain(expectation.prose)
    }
  })

  test('serializes English Markdown metadata while preserving code fences and code payloads', () => {
    const markdown = buildCategoryMarkdown(baseUrl, 'ai', 'chat', 'en')

    expect(markdown).toContain('# Chat')
    expect(markdown).toContain('## Native OpenAI Format `POST`')
    expect(markdown).toContain(
      '| Parameter | Type | Required | Default | Description |'
    )
    expect(markdown).toContain('| `model` | string | Yes | - | Model ID |')
    expect(markdown).toContain('**Response 200**')
    expect(markdown).toContain('```json')
    expect(markdown).toContain('```bash')
    expect(markdown).toContain('"content": "你是一个乐于助人的助手"')
  })

  test('serializes English Request presentation labels as JSON fences', () => {
    const assetMarkdown = buildCategoryMarkdown(
      baseUrl,
      'video',
      'video-asset',
      'en'
    )
    const soraMarkdown = buildCategoryMarkdown(
      baseUrl,
      'video',
      'video-sora',
      'en'
    )

    expect(assetMarkdown).toContain('**Request**\n\n```json\n{')
    expect(soraMarkdown).toContain('**Request**\n\n```json\n{')
  })

  test('keeps protocol identifiers and raw code samples identical across language trees', () => {
    const chinese = protocolValues(buildDocGroups(baseUrl, 'zh'))
    const english = protocolValues(buildDocGroups(baseUrl, 'en'))

    expect(english).toEqual(chinese)
  })
})
