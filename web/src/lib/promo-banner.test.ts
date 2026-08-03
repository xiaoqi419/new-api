import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { bannerColorMap, PICKABLE_COLORS } from './colors'
import {
  parsePromoBannerConfig,
  serializePromoBannerConfig,
} from './promo-banner'

describe('promo banner config', () => {
  test('treats missing and malformed values as disabled', () => {
    for (const raw of [
      undefined,
      null,
      '',
      '   ',
      'not json',
      '[]',
      '"a string"',
      '{',
    ]) {
      const parsed = parsePromoBannerConfig(raw)
      assert.equal(
        parsed.enabled,
        false,
        `输入 ${JSON.stringify(raw)} 不应该点亮横幅`
      )
      assert.deepEqual(parsed.items, [])
    }
  })

  test('only a real boolean true enables the banner', () => {
    // 选项以 JSON 字符串存库,手工编辑过的值可能带上 "true" / 1 这类脏数据。
    // 宽松判断会让站长在不知情的情况下全站挂上横幅。
    const items = '"items":[{"text":"hi"}]'
    assert.equal(
      parsePromoBannerConfig(`{"enabled":"true",${items}}`).enabled,
      false
    )
    assert.equal(
      parsePromoBannerConfig(`{"enabled":1,${items}}`).enabled,
      false
    )
    assert.equal(
      parsePromoBannerConfig(`{"enabled":true,${items}}`).enabled,
      true
    )
  })

  test('keeps several entries in order and trims each one', () => {
    const parsed = parsePromoBannerConfig(
      '{"enabled":true,"items":[' +
        '{"text":"  首充 0.3x  ","button_text":" 立即购买 ","button_link":" /pricing ","color":"red"},' +
        '{"text":"全天 0.5x","color":"teal"}]}'
    )
    assert.equal(parsed.items.length, 2)
    assert.deepEqual(parsed.items[0], {
      text: '首充 0.3x',
      button_text: '立即购买',
      button_link: '/pricing',
      color: 'red',
    })
    assert.equal(parsed.items[1].text, '全天 0.5x')
    assert.equal(parsed.items[1].color, 'teal')
  })

  test('drops entries with no message so the strip never rotates onto a blank row', () => {
    const parsed = parsePromoBannerConfig(
      '{"enabled":true,"items":[{"text":"有文案"},{"text":"   "},{"button_text":"只有按钮"},"垃圾",null]}'
    )
    assert.equal(parsed.items.length, 1)
    assert.equal(parsed.items[0].text, '有文案')
  })

  test('falls back to a known color when the stored one is not in the palette', () => {
    const parsed = parsePromoBannerConfig(
      '{"enabled":true,"items":[{"text":"a","color":"chartreuse"},{"text":"b"}]}'
    )
    // 落到调色板外的值会渲染成没有底色类的裸横幅,白字直接看不见。
    for (const item of parsed.items) {
      assert.ok(bannerColorMap[item.color], `bannerColorMap 缺 ${item.color}`)
    }
  })

  test('reads a config saved before the strip supported several entries', () => {
    // 20260803-cf32fb8b 的格式:文案直接挂在根对象上,没有 items。
    // 升级后如果不认这个形状,已经配好的横幅会静默消失。
    const parsed = parsePromoBannerConfig(
      '{"enabled":true,"text":"老格式文案","button_text":"立即购买","button_link":"/pricing"}'
    )
    assert.equal(parsed.enabled, true)
    assert.equal(parsed.items.length, 1)
    assert.equal(parsed.items[0].text, '老格式文案')
    assert.equal(parsed.items[0].button_text, '立即购买')
    assert.ok(bannerColorMap[parsed.items[0].color])
  })

  test('survives a serialize and parse round trip', () => {
    const config = {
      enabled: true,
      items: [
        {
          text: '🔥 GPT 灵活套餐 · 0.3x 首充',
          button_text: '立即购买',
          button_link: 'https://example.com/buy',
          color: 'violet' as const,
        },
        {
          text: '全天稳定 0.5x',
          button_text: '',
          button_link: '',
          color: 'amber' as const,
        },
      ],
    }
    assert.deepEqual(
      parsePromoBannerConfig(serializePromoBannerConfig(config)),
      config
    )
  })

  test('every pickable color has a strip fill', () => {
    for (const option of PICKABLE_COLORS) {
      assert.ok(
        bannerColorMap[option.value],
        `bannerColorMap 缺 ${option.value},选了它的横幅会没有底色`
      )
    }
  })
})
