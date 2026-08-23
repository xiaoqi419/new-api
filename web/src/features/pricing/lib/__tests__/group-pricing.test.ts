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
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { getGroupRatioClassName } from '../../../../lib/colors'
import type { PricingModel } from '../../types'
import { formatGroupRatioLabel } from '../model-helpers'
import { formatGroupChipPrice, formatGroupPrice } from '../price'

const GROUP_RATIO = { default: 1, vip: 0.9, trial: 2 }

const CHIP_OPTIONS = {
  tokenUnit: 'M' as const,
  showRechargePrice: false,
  priceRate: 1,
  usdExchangeRate: 1,
  groupRatio: GROUP_RATIO,
  dynamicLabel: 'Dynamic Pricing',
}

/** model_ratio 1.25 -> input $2.5/1M, completion_ratio 6 -> output $15/1M */
function tokenModel(overrides: Partial<PricingModel> = {}): PricingModel {
  return {
    model_name: 'gpt-5.4',
    quota_type: 0,
    model_ratio: 1.25,
    completion_ratio: 6,
    enable_groups: ['default', 'vip', 'trial'],
    group_ratio: GROUP_RATIO,
    ...overrides,
  } as PricingModel
}

function requestModel(overrides: Partial<PricingModel> = {}): PricingModel {
  return {
    model_name: 'seedance-pro',
    quota_type: 1,
    model_ratio: 1,
    completion_ratio: 1,
    model_price: 0.5,
    enable_groups: ['default', 'vip'],
    group_ratio: GROUP_RATIO,
    ...overrides,
  } as PricingModel
}

describe('group chip price matches the detail page', () => {
  test('chip price equals the detail page price for the same group', () => {
    const model = tokenModel()

    for (const group of ['default', 'vip', 'trial']) {
      const detailInput = formatGroupPrice(
        model,
        group,
        'input',
        'M',
        false,
        1,
        1,
        GROUP_RATIO
      )
      const detailOutput = formatGroupPrice(
        model,
        group,
        'output',
        'M',
        false,
        1,
        1,
        GROUP_RATIO
      )

      assert.equal(
        formatGroupChipPrice(model, group, CHIP_OPTIONS),
        `${detailInput} / ${detailOutput}`,
        `group ${group} must read the same on the chip and on the detail page`
      )
    }
  })

  test('applies the row group ratio instead of the cheapest group', () => {
    const model = tokenModel()

    assert.equal(
      formatGroupChipPrice(model, 'default', CHIP_OPTIONS),
      '$2.5 / $15'
    )
    assert.equal(
      formatGroupChipPrice(model, 'vip', CHIP_OPTIONS),
      '$2.25 / $13.5'
    )
    assert.equal(formatGroupChipPrice(model, 'trial', CHIP_OPTIONS), '$5 / $30')
  })

  test('a missing group ratio falls back to 1 rather than to zero', () => {
    const model = tokenModel({ enable_groups: ['default', 'unpriced'] })

    assert.equal(
      formatGroupChipPrice(model, 'unpriced', CHIP_OPTIONS),
      '$2.5 / $15'
    )
  })

  test('keeps a configured zero ratio instead of silently charging base', () => {
    const model = tokenModel({ enable_groups: ['free'] })

    assert.equal(
      formatGroupChipPrice(model, 'free', {
        ...CHIP_OPTIONS,
        groupRatio: { free: 0 },
      }),
      '$0 / $0'
    )
  })

  test('per-request models scale their fixed price by the group ratio', () => {
    const model = requestModel()

    assert.equal(formatGroupChipPrice(model, 'default', CHIP_OPTIONS), '$0.5')
    assert.equal(formatGroupChipPrice(model, 'vip', CHIP_OPTIONS), '$0.45')
  })

  test('unparseable tiered expressions fall back to the dynamic label', () => {
    const model = tokenModel({
      billing_mode: 'tiered_expr',
      billing_expr: 'this is not a tier table',
    })

    assert.equal(
      formatGroupChipPrice(model, 'vip', CHIP_OPTIONS),
      'Dynamic Pricing'
    )
  })
})

describe('group ratio badge', () => {
  test('never renders a discounted ratio as a bare x0', () => {
    assert.equal(formatGroupRatioLabel(0.0004), 'x<0.001')
    assert.equal(formatGroupRatioLabel(0.0000001), 'x<0.001')
    assert.equal(formatGroupRatioLabel(0.001), 'x0.001')
    assert.equal(formatGroupRatioLabel(0.9), 'x0.9')
    assert.equal(formatGroupRatioLabel(2.5), 'x2.5')
  })

  test('only an exactly zero ratio prints x0', () => {
    assert.equal(formatGroupRatioLabel(0), 'x0')
    assert.equal(formatGroupRatioLabel(1), 'x1')
  })

  test('has no label when the ratio is unknown', () => {
    assert.equal(formatGroupRatioLabel(undefined), undefined)
    assert.equal(formatGroupRatioLabel(Number.NaN), undefined)
    assert.equal(formatGroupRatioLabel(Number.POSITIVE_INFINITY), undefined)
  })

  test('colors a ratio by whether it is cheaper than base', () => {
    // 分组视图、侧栏筛选、详情分组卡三处共用这一个判定,避免同屏出现两套语义色。
    assert.match(getGroupRatioClassName(0.9), /bg-info\/10/)
    assert.match(getGroupRatioClassName(0.9), /text-foreground/)
    assert.match(getGroupRatioClassName(0.9), /dark:bg-success\/15/)
    assert.match(getGroupRatioClassName(0.9), /dark:text-success/)
    assert.match(getGroupRatioClassName(1.5), /text-warning/)
    assert.match(getGroupRatioClassName(1), /text-muted-foreground/)
  })
})
