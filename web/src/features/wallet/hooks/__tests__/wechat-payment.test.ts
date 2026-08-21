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

import {
  getWechatPaymentAction,
  getWechatPaymentFailureMessage,
  selectWechatPaymentScene,
} from '../use-wechat-payment'

describe('WeChat Pay scene selection', () => {
  test('uses JSAPI inside WeChat when JSAPI is enabled', () => {
    assert.equal(
      selectWechatPaymentScene('Mozilla/5.0 MicroMessenger/8.0 Mobile', {
        native: true,
        h5: true,
        jsapi: true,
      }),
      'jsapi'
    )
  })

  test('uses H5 on external mobile browsers when H5 is enabled', () => {
    assert.equal(
      selectWechatPaymentScene('Mozilla/5.0 (Linux; Android 14) Mobile', {
        native: true,
        h5: true,
        jsapi: true,
      }),
      'h5'
    )
  })

  test('uses Native on desktop browsers when Native is enabled', () => {
    assert.equal(
      selectWechatPaymentScene('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', {
        native: true,
        h5: true,
        jsapi: true,
      }),
      'native'
    )
  })

  test('falls back to Native when the preferred browser scene is disabled', () => {
    assert.equal(
      selectWechatPaymentScene('Mozilla/5.0 MicroMessenger/8.0 Mobile', {
        native: true,
        h5: true,
        jsapi: false,
      }),
      'native'
    )
    assert.equal(
      selectWechatPaymentScene('Mozilla/5.0 (iPhone) Mobile', {
        native: true,
        h5: false,
        jsapi: false,
      }),
      'native'
    )
  })

  test('returns no scene when the current browser has no supported configuration', () => {
    assert.equal(
      selectWechatPaymentScene('Mozilla/5.0 MicroMessenger/8.0 Mobile', {
        native: false,
        h5: true,
        jsapi: false,
      }),
      null
    )
    assert.equal(
      selectWechatPaymentScene('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', {
        native: false,
        h5: true,
        jsapi: true,
      }),
      null
    )
  })
})

describe('WeChat Pay response parsing', () => {
  test('accepts a Native QR order with the trade number needed for polling', () => {
    assert.deepEqual(
      getWechatPaymentAction('native', {
        qr_code: 'data:image/png;base64,iVBORw0KGgo=',
        trade_no: 'WX1NOabcd1700000000',
      }),
      {
        type: 'qr',
        qrCode: 'data:image/png;base64,iVBORw0KGgo=',
        tradeNo: 'WX1NOabcd1700000000',
      }
    )
  })

  test('rejects a Native response that cannot open and poll a real order', () => {
    assert.equal(
      getWechatPaymentAction('native', {
        qr_code: '',
        trade_no: 'WX1',
      }),
      null
    )
    assert.equal(
      getWechatPaymentAction('native', {
        qr_code: 'data:image/png;base64,x',
      }),
      null
    )
  })

  test('accepts only safe H5 redirect targets', () => {
    assert.deepEqual(
      getWechatPaymentAction('h5', {
        h5_url: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb',
      }),
      {
        type: 'redirect',
        url: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb',
      }
    )
    assert.equal(
      getWechatPaymentAction('h5', { h5_url: 'javascript:alert(1)' }),
      null
    )
    assert.equal(
      getWechatPaymentAction('h5', { h5_url: 'https:checkout.example.com' }),
      null
    )
  })

  test('accepts only safe JSAPI authorization targets', () => {
    assert.deepEqual(
      getWechatPaymentAction('jsapi', {
        authorize_url:
          'https://open.weixin.qq.com/connect/oauth2/authorize?appid=test',
      }),
      {
        type: 'redirect',
        url: 'https://open.weixin.qq.com/connect/oauth2/authorize?appid=test',
      }
    )
    assert.equal(
      getWechatPaymentAction('jsapi', { authorize_url: '/relative/path' }),
      null
    )
  })

  test('rejects backend string errors and unrelated response objects', () => {
    assert.equal(getWechatPaymentAction('native', '管理员未开启微信支付'), null)
    assert.equal(getWechatPaymentAction('h5', null), null)
    assert.equal(
      getWechatPaymentAction('jsapi', { h5_url: 'https://x.test' }),
      null
    )
  })

  test('does not expose a success envelope as an error message', () => {
    assert.equal(
      getWechatPaymentFailureMessage({ message: 'success', data: {} }),
      'Payment request failed'
    )
    assert.equal(
      getWechatPaymentFailureMessage({
        message: 'error',
        data: '未开启 Native 扫码支付',
      }),
      '未开启 Native 扫码支付'
    )
  })
})
