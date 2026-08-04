import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  BANNER_GRADIENTS,
  BANNER_PRESET_COLORS,
  contrastRatio,
  DEFAULT_BANNER_FILL,
  GRADIENT_PREFIX,
  isHexColor,
  MIN_TEXT_CONTRAST,
  normalizeBannerFill,
  normalizeHex,
  resolveBannerFill,
  worstContrast,
} from './banner-fill'

const WHITE = '#ffffff'
/** 与组件里深色文字用的同一个值。 */
const DARK_TEXT = '#1d293d'

describe('banner fill', () => {
  test('contrast ratio matches known WCAG values', () => {
    // 参照值取自 WCAG 定义:黑白极值 21,同色 1。
    assert.equal(Number(contrastRatio('#000000', WHITE).toFixed(2)), 21)
    assert.equal(contrastRatio('#155dfc', '#155dfc'), 1)
    // blue-600 对白字,与从主题 oklch 独立换算所得一致。
    assert.equal(Number(contrastRatio('#155dfc', WHITE).toFixed(2)), 5.25)
  })

  test('every preset keeps white text above AA', () => {
    for (const preset of BANNER_PRESET_COLORS) {
      const ratio = contrastRatio(preset.value, WHITE)
      assert.ok(
        ratio >= MIN_TEXT_CONTRAST,
        `${preset.label} (${preset.value}) 白字只有 ${ratio.toFixed(2)},低于 ${MIN_TEXT_CONTRAST}`
      )
    }
  })

  test('every gradient stays readable along the whole ramp', () => {
    for (const gradient of BANNER_GRADIENTS) {
      const ratio = worstContrast(`${GRADIENT_PREFIX}${gradient.id}`, WHITE)
      assert.ok(
        ratio >= MIN_TEXT_CONTRAST,
        `${gradient.label} 最差处白字只有 ${ratio.toFixed(2)}`
      )
    }
  })

  test('samples inside the ramp, not just the two stops', () => {
    // 只查两端会高估可读性:亮度里绿的权重(0.7152)远高于蓝(0.0722),
    // 青→紫这种一升一降的渐变中段亮度会落在两端之外。实测 aurora 对
    // 深色字,两端最差 2.48,中段只有 2.13,差了 14%。
    const aurora = BANNER_GRADIENTS.find((item) => item.id === 'aurora')
    assert.ok(aurora)
    const sampled = worstContrast(`${GRADIENT_PREFIX}${aurora.id}`, DARK_TEXT)
    const endpointsOnly = Math.min(
      contrastRatio(aurora.from, DARK_TEXT),
      contrastRatio(aurora.to, DARK_TEXT)
    )
    assert.ok(
      sampled < endpointsOnly - 0.1,
      `采样应比只看两端明显更严格,但得到 ${sampled.toFixed(4)} 对 ${endpointsOnly.toFixed(4)}`
    )
  })

  test('picks dark text when the fill is light', () => {
    assert.equal(resolveBannerFill('#fef08a').onLight, true)
    assert.equal(resolveBannerFill('#ffffff').onLight, true)
    assert.equal(resolveBannerFill('#155dfc').onLight, false)
    assert.equal(resolveBannerFill('#000000').onLight, false)
  })

  test('flags a fill no text color can sit on', () => {
    // 中灰对黑白都不到 4.5,后台要给出提示而不是静默出一条看不清的横幅。
    assert.ok(resolveBannerFill('#808080').contrast < MIN_TEXT_CONTRAST)
    assert.ok(resolveBannerFill('#155dfc').contrast >= MIN_TEXT_CONTRAST)
  })

  test('accepts short hex and normalizes case', () => {
    assert.equal(normalizeHex('#ABC'), '#aabbcc')
    assert.equal(normalizeHex('#E7000B'), '#e7000b')
    assert.equal(normalizeBannerFill('#ABC'), '#aabbcc')
    assert.ok(isHexColor('#abc'))
    assert.ok(isHexColor('#AABBCC'))
    assert.ok(!isHexColor('abc'))
    assert.ok(!isHexColor('#abcd'))
    assert.ok(!isHexColor('rgb(1,2,3)'))
  })

  test('keeps a known gradient and rejects an unknown one', () => {
    assert.equal(
      normalizeBannerFill(`${GRADIENT_PREFIX}sunset`),
      `${GRADIENT_PREFIX}sunset`
    )
    assert.equal(
      normalizeBannerFill(`${GRADIENT_PREFIX}nope`),
      DEFAULT_BANNER_FILL
    )
    assert.match(
      resolveBannerFill(`${GRADIENT_PREFIX}sunset`).background,
      /^linear-gradient\(90deg, #e7000b 0%, #bb4d00 100%\)$/
    )
  })

  test('reads the color names the first picker stored', () => {
    // 20260803-cbada657 存的是 'red'/'teal' 这类色名。升级后若不认,
    // 已配好的横幅会退回默认蓝,站长看不出为什么颜色全变了。
    assert.equal(normalizeBannerFill('red'), '#e7000b')
    assert.equal(normalizeBannerFill('teal'), '#00786f')
    assert.equal(normalizeBannerFill('Violet'), '#7f22fe')
  })

  test('falls back for junk instead of rendering a colorless strip', () => {
    for (const raw of [undefined, null, '', '   ', 42, {}, 'chartreuse']) {
      assert.equal(normalizeBannerFill(raw), DEFAULT_BANNER_FILL)
    }
  })
})
