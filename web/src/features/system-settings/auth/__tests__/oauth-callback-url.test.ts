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
  buildOAuthCallbackUrl,
  buildWeChatMpCallbackUrl,
} from '../oauth-callback-url'

describe('WeChat Official Account server URL', () => {
  test('points at the built-in message callback rather than an OAuth redirect', () => {
    assert.equal(
      buildWeChatMpCallbackUrl('https://api.example.com', 'Site URL'),
      'https://api.example.com/api/wechat/callback'
    )
  })

  test('drops trailing slashes so the pasted URL has no double slash', () => {
    assert.equal(
      buildWeChatMpCallbackUrl('https://api.example.com//', 'Site URL'),
      'https://api.example.com/api/wechat/callback'
    )
  })

  test('falls back to the placeholder when the server address is unset', () => {
    assert.equal(
      buildWeChatMpCallbackUrl('   ', 'Site URL'),
      'Site URL/api/wechat/callback'
    )
  })
})

describe('OAuth callback URL', () => {
  test('keeps provider redirects under /oauth/', () => {
    assert.equal(
      buildOAuthCallbackUrl('https://api.example.com/', 'github', 'Site URL'),
      'https://api.example.com/oauth/github'
    )
  })
})
