import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, expect, it, vi } from 'vitest'

import { handleServerError } from '@/lib/handle-server-error'

import { FetchModelsDialog } from '../dialogs/fetch-models-dialog'

vi.mock('../channels-provider', () => ({
  useChannels: () => ({ currentRow: null }),
}))
vi.mock('@/components/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => children,
}))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('shows the nested upstream error once even when already reported by the HTTP layer', async () => {
  const notify = vi.spyOn(toast, 'error').mockReturnValue('error')
  const failure = {
    response: {
      data: { success: false, message: 'Upstream rejected the model list' },
    },
  }
  const fetcher = vi.fn(async (): Promise<string[]> => {
    handleServerError(failure)
    throw failure
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <FetchModelsDialog
        open
        onOpenChange={() => {}}
        customFetcher={fetcher}
        existingModelsOverride={[]}
        onModelsSelected={() => {}}
      />
    </QueryClientProvider>
  )
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  await waitFor(() =>
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      'Upstream rejected the model list'
    )
  )
  client.clear()
})
