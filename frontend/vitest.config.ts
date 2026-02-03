import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    pool: 'forks',
    coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
            'node_modules/**',
            '.next/**',
            '**/*.d.ts',
            '*.config.ts',
            '*.config.mjs',
            'components/ui/**', // Exclude shadcn components from coverage requirements as they are external code
        ]
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
