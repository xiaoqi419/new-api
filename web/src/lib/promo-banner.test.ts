import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { DEFAULT_BANNER_FILL, GRADIENT_PREFIX } from './banner-fill'
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
      color: '#e7000b',
    })
    assert.equal(parsed.items[1].text, '全天 0.5x')
    assert.equal(parsed.items[1].color, '#00786f')
  })

  test('drops entries with no message so the strip never rotates onto a blank row', () => {
    const parsed = parsePromoBannerConfig(
      '{"enabled":true,"items":[{"text":"有文案"},{"text":"   "},{"button_text":"只有按钮"},"垃圾",null]}'
    )
    assert.equal(parsed.items.length, 1)
    assert.equal(parsed.items[0].text, '有文案')
  })

  test('falls back to a usable fill when the stored one is unreadable garbage', () => {
    const parsed = parsePromoBannerConfig(
      '{"enabled":true,"items":[{"text":"a","color":"chartreuse"},{"text":"b"},{"text":"c","color":"#ABC"}]}'
    )
    // 无法解析的值会渲染成没有底色的裸横幅,文字直接看不见。
    assert.equal(parsed.items[0].color, DEFAULT_BANNER_FILL)
    assert.equal(parsed.items[1].color, DEFAULT_BANNER_FILL)
    assert.equal(parsed.items[2].color, '#aabbcc')
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
    assert.equal(parsed.items[0].color, DEFAULT_BANNER_FILL)
  })

  test('survives a serialize and parse round trip', () => {
    const config = {
      enabled: true,
      items: [
        {
          text: '🔥 GPT 灵活套餐 · 0.3x 首充',
          button_text: '立即购买',
          button_link: 'https://example.com/buy',
          color: '#7f22fe',
        },
        {
          text: '全天稳定 0.5x',
          button_text: '',
          button_link: '',
          color: `${GRADIENT_PREFIX}sunset`,
        },
      ],
    }
    assert.deepEqual(
      parsePromoBannerConfig(serializePromoBannerConfig(config)),
      config
    )
  })
})
