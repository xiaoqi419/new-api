import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./classic/src/components/topup/__tests__/setup.js'],
    include: [
      'classic/src/**/__tests__/*.test.jsx',
      'classic/src/components/topup/modals/EpayCheckoutModal.test.jsx',
    ],
    clearMocks: true,
    restoreMocks: true,
  },
})
