import { resolve } from 'node:path'

// Vitest does not read Rsbuild aliases; keep React component tests on the same
// `@` -> `src` import contract used by the application build.
export default {
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src'),
    },
  },
}
