import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

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
      assert.equal(
        parsePromoBannerConfig(raw).enabled,
        false,
        `输入 ${JSON.stringify(raw)} 不应该点亮横幅`
      )
    }
  })

  test('only a real boolean true enables the banner', () => {
    // 选项以 JSON 字符串存库,手工编辑过的值可能带上 "true" / 1 这类脏数据。
    // 宽松判断会让站长在不知情的情况下全站挂上横幅。
    assert.equal(parsePromoBannerConfig('{"enabled":"true"}').enabled, false)
    assert.equal(parsePromoBannerConfig('{"enabled":1}').enabled, false)
    assert.equal(parsePromoBannerConfig('{"enabled":true}').enabled, true)
  })

  test('trims the copy so blank-looking text does not render a strip', () => {
    const parsed = parsePromoBannerConfig(
      '{"enabled":true,"text":"  限时 0.5x  ","button_text":" 立即购买 ","button_link":" /pricing "}'
    )
    assert.equal(parsed.text, '限时 0.5x')
    assert.equal(parsed.button_text, '立即购买')
    assert.equal(parsed.button_link, '/pricing')
  })

  test('accepts an already-parsed object as well as a raw string', () => {
    const parsed = parsePromoBannerConfig({ enabled: true, text: 'hi' })
    assert.equal(parsed.enabled, true)
    assert.equal(parsed.text, 'hi')
    assert.equal(parsed.button_text, '')
  })

  test('survives a serialize and parse round trip', () => {
    const config = {
      enabled: true,
      text: '🔥 GPT 灵活套餐 · 0.3x 首充',
      button_text: '立即购买',
      button_link: 'https://example.com/buy',
    }
    assert.deepEqual(
      parsePromoBannerConfig(serializePromoBannerConfig(config)),
      config
    )
  })
})
