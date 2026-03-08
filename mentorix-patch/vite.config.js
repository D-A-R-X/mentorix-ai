import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to backend during local dev — avoids CORS issues
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/user': 'http://127.0.0.1:8000',
      '/admin': 'http://127.0.0.1:8000',
      '/voice': 'http://127.0.0.1:8000',
      '/assessment': 'http://127.0.0.1:8000',
      '/courses': 'http://127.0.0.1:8000',
      '/onboarding': 'http://127.0.0.1:8000',
      '/institutions': 'http://127.0.0.1:8000',
      '/chat': 'http://127.0.0.1:8000',
      '/honor': 'http://127.0.0.1:8000',
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
