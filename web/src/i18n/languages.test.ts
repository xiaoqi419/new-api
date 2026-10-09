/*
Copyright (C) 2023-2026 QuantumNous

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
  convertDetectedLanguage,
  normalizeInterfaceLanguage,
  toIntlLocale,
} from './languages'

describe('convertDetectedLanguage', () => {
  test.each(['zhTW', 'zhCN'])(
    'keeps cached interface code %s stable on the next visit',
    (code) => {
      // i18next caches `zhTW`/`zhCN` (the supportedLngs codes) to localStorage,
      // and the detector runs this converter on the cached value at every page
      // load — if `zhTW` does not survive the round-trip, a user who picked
      // Traditional Chinese is flipped to Simplified on the next load and the
      // cache is overwritten, making the flip permanent.
      expect(convertDetectedLanguage(code)).toBe(code)
    }
  )

  test.each(['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW'])(
    'maps traditional Chinese browser tag %s to zhTW',
    (tag) => {
      expect(convertDetectedLanguage(tag)).toBe('zhTW')
    }
  )

  test.each(['zh', 'zh-CN', 'zh-Hans', 'zh_CN'])(
    'maps simplified Chinese browser tag %s to zhCN',
    (tag) => {
      expect(convertDetectedLanguage(tag)).toBe('zhCN')
    }
  )

  test.each(['en', 'fr-FR', 'ja', 'ru', 'vi'])(
    'passes non-Chinese detected tag %s through for i18next matching',
    (tag) => {
      expect(convertDetectedLanguage(tag)).toBe(tag)
    }
  )
})

describe('normalizeInterfaceLanguage', () => {
  test.each(['zhCN', 'zhTW', 'en', 'fr', 'ja', 'ru', 'vi'])(
    'keeps supported interface language %s selected',
    (code) => {
      expect(normalizeInterfaceLanguage(code)).toBe(code)
    }
  )

  test.each(['zh_tw', 'ZHTW', ' zh-TW ', 'zh-Hant', 'zh-Hant-TW', 'zh_HK'])(
    'selects traditional Chinese for saved locale %s',
    (tag) => {
      expect(normalizeInterfaceLanguage(tag)).toBe('zhTW')
    }
  )

  test.each(['zh', 'zh_cn', 'ZHCN', ' zh-Hans ', 'zh-Hans-CN'])(
    'selects simplified Chinese for saved locale %s',
    (tag) => {
      expect(normalizeInterfaceLanguage(tag)).toBe('zhCN')
    }
  )

  test.each([
    ['en-US', 'en'],
    ['fr-FR', 'fr'],
    ['ja-JP', 'ja'],
    ['ru-RU', 'ru'],
    ['VI_vn', 'vi'],
  ])('selects supported language %s as %s', (tag, expected) => {
    expect(normalizeInterfaceLanguage(tag)).toBe(expected)
  })

  test.each([undefined, null, '', ' ', 'not-a-language', 'de-DE'])(
    'falls back to English for unsupported saved language %s',
    (tag) => {
      expect(normalizeInterfaceLanguage(tag)).toBe('en')
    }
  )
})

describe('toIntlLocale', () => {
  test.each([
    ['zhCN', 'zh-CN'],
    ['zhTW', 'zh-TW'],
    ['en', 'en'],
    ['fr', 'fr'],
    ['ja', 'ja'],
    ['ru', 'ru'],
    ['vi', 'vi'],
  ])(
    'formats interface language %s with valid Intl locale %s',
    (code, locale) => {
      expect(toIntlLocale(code)).toBe(locale)
      expect(() => new Intl.NumberFormat(toIntlLocale(code))).not.toThrow()
    }
  )

  test('canonicalizes a valid regional BCP-47 locale', () => {
    expect(toIntlLocale('fr-ca')).toBe('fr-CA')
  })

  test.each([undefined, null, '', 'invalid_locale', 'not a language'])(
    'uses the runtime default for invalid Intl language %s',
    (tag) => {
      expect(toIntlLocale(tag)).toBeUndefined()
      expect(() => new Intl.NumberFormat(toIntlLocale(tag))).not.toThrow()
    }
  )
})
