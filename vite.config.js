import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  esbuild: {
    // Allow JSX syntax in .js files too
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/auth':         'http://127.0.0.1:8000',
      '/user':         'http://127.0.0.1:8000',
      '/admin':        'http://127.0.0.1:8000',
      '/voice':        'http://127.0.0.1:8000',
      '/assessment':   'http://127.0.0.1:8000',
      '/courses':      'http://127.0.0.1:8000',
      '/institutions': 'http://127.0.0.1:8000',
      '/chat':         'http://127.0.0.1:8000',
      '/honor':        'http://127.0.0.1:8000',
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
