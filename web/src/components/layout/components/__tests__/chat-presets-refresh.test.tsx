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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'

import { ChatPresetsItem } from '../chat-presets-item'

vi.mock('@/features/chat/hooks/use-chat-presets', () => ({
  useChatPresets: () => ({
    chatPresets: [
      {
        id: 'demo',
        name: 'Demo Chat',
        url: 'https://example.com/chat',
        type: 'web',
      },
    ],
    serverAddress: '',
  }),
}))

function renderChatPreset(defaultOpen: boolean) {
  const root = createRootRoute({
    component: () => (
      <SidebarProvider defaultOpen={defaultOpen}>
        <ChatPresetsItem item={{ title: 'Chat', type: 'chat-presets' }} />
      </SidebarProvider>
    ),
  })
  const chatRoute = createRoute({
    getParentRoute: () => root,
    path: '/chat/$chatId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: root.addChildren([chatRoute]),
    history: createMemoryHistory({ initialEntries: ['/chat/demo'] }),
  })

  render(<RouterProvider router={router} />)
  return router
}

test('clicking the open chat preset again reloads that conversation', async () => {
  const user = userEvent.setup()
  const router = renderChatPreset(true)
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
  await user.click(await screen.findByRole('link', { name: 'Demo Chat' }))

  expect(navigate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ href: '/chat/demo', reloadDocument: true })
  )
})

test('clicking the open chat preset in the collapsed sidebar reloads it', async () => {
  const user = userEvent.setup()
  const router = renderChatPreset(false)
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()

  await user.click(await screen.findByRole('button', { name: 'Chat' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Demo Chat' }))

  expect(navigate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ href: '/chat/demo', reloadDocument: true })
  )
})
