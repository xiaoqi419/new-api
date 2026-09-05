import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    title: 'Admin H5',
  },
  output: {
    assetPrefix: '/admin-h5/',
  },
  server: {
    base: '/admin-h5/',
  },
  source: {
    entry: {
      index: './src/main.tsx',
    },
    define: {
      'import.meta.env': JSON.stringify({
        MODE:
          process.env.NODE_ENV === 'production' ? 'production' : 'development',
        DEV: process.env.NODE_ENV !== 'production',
        PROD: process.env.NODE_ENV === 'production',
        BASE_URL: '/admin-h5/',
        ASSET_PREFIX: '/admin-h5',
        VITE_DOMESTIC_API_BASE_URL: process.env.VITE_DOMESTIC_API_BASE_URL,
        VITE_INTERNATIONAL_API_BASE_URL:
          process.env.VITE_INTERNATIONAL_API_BASE_URL,
        VITE_DEFAULT_SITE: process.env.VITE_DEFAULT_SITE,
      }),
    },
  },
})
