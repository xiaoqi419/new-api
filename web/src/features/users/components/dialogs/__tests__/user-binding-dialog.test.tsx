import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'

import { api } from '@/lib/api'

import { UsersProvider } from '../../users-provider'
import { UserBindingDialog } from '../user-binding-dialog'

/**
 * The dialog reads `/api/status` through the shared React Query cache, so it
 * needs a provider. A fresh client per render keeps tests isolated.
 */
const queryClients: QueryClient[] = []

function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  queryClients.push(queryClient)
  return queryClient
}

function renderWithQueryClient(
  ui: React.ReactElement,
  queryClient = createQueryClient()
): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersProvider>{ui}</UsersProvider>
    </QueryClientProvider>
  )
}

type ApiMethod = (url: string) => Promise<{ data: unknown }>
type MockableApi = {
  get: ApiMethod
  post: ApiMethod
  delete: ApiMethod
}

const apiClient = api as unknown as MockableApi
const originalGet = apiClient.get
const originalPost = apiClient.post
const originalDelete = apiClient.delete

const verificationMethods = {
  data: {
    success: true,
    data: {
      scope: 'admin.user.binding.clear',
      methods: [{ method: '2fa', available: true }],
      oauth_providers: [],
      password_encryption_enabled: false,
    },
  },
}

// Every unbind is gated by the shared step-up ceremony mounted in UsersProvider.
async function completeUnbindVerification() {
  const code = await screen.findByLabelText('Authenticator code or backup code')
  fireEvent.change(code, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
}
const originalGetAnimations = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)

const user = {
  id: 7,
  username: 'bound-user',
  email: 'user@example.com',
  github_id: 'github-user',
  discord_id: 'discord-user',
  wechat_id: 'wechat-user',
  oidc_id: 'oidc-user',
  telegram_id: 'telegram-user',
  linux_do_id: 'linuxdo-user',
}

function findUnbindButton(provider: string): HTMLButtonElement {
  let container = screen.getByText(provider).parentElement
  while (container && !container.querySelector('button')) {
    container = container.parentElement
  }
  const button = container?.querySelector<HTMLButtonElement>('button')
  if (!button) {
    throw new Error(`Expected unbind button for ${provider}`)
  }
  return button
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
})

afterAll(() => {
  if (originalGetAnimations) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      originalGetAnimations
    )
    return
  }
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
})

afterEach(() => {
  queryClients.splice(0).forEach((client) => client.clear())
  apiClient.get = originalGet
  apiClient.post = originalPost
  apiClient.delete = originalDelete
})

describe('UserBindingDialog built-in bindings', () => {
  test('submits every built-in provider type accepted by the backend', async () => {
    const deletedUrls: string[] = []
    apiClient.get = async (url) => {
      switch (url) {
        case '/api/user/7':
          return { data: { success: true, data: user } }
        case '/api/user/7/oauth/bindings':
          return { data: { success: true, data: [] } }
        case '/api/verify/methods':
          return verificationMethods
        case '/api/status':
          return {
            data: {
              success: true,
              data: {
                github_oauth: true,
                discord_oauth: true,
                wechat_login: true,
                oidc_enabled: true,
                telegram_oauth: true,
                linuxdo_oauth: true,
              },
            },
          }
        default:
          throw new Error(`Unexpected GET ${url}`)
      }
    }
    apiClient.post = async (url) => {
      if (url !== '/api/verify') throw new Error(`Unexpected POST ${url}`)
      return {
        data: {
          success: true,
          data: {
            proof_token: 'binding-proof',
            method: '2fa',
            scope: 'admin.user.binding.clear',
            expires_at: Math.floor(Date.now() / 1000) + 60,
          },
        },
      }
    }
    apiClient.delete = async (url) => {
      deletedUrls.push(url)
      return { data: { success: true, message: 'success' } }
    }

    renderWithQueryClient(
      <UserBindingDialog open userId={7} onOpenChange={() => undefined} />
    )

    const expectedBindings = [
      ['Email', 'email'],
      ['GitHub', 'github'],
      ['Discord', 'discord'],
      ['WeChat', 'wechat'],
      ['OIDC', 'oidc'],
      ['Telegram', 'telegram'],
      ['LinuxDO', 'linuxdo'],
    ] as const

    await screen.findByText('bound-user (ID: 7)')
    for (const [provider, bindingType] of expectedBindings) {
      fireEvent.click(findUnbindButton(provider))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Unbind' }))
      await completeUnbindVerification()
      await waitFor(() => {
        expect(deletedUrls.at(-1)).toBe(`/api/user/7/bindings/${bindingType}`)
      })
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: 'Confirm Unbind' })
        ).not.toBeInTheDocument()
      })
    }

    expect(deletedUrls).toHaveLength(expectedBindings.length)
  })
})
