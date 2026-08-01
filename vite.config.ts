import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // En desarrollo el front corre en Vite y la API en el otro proceso.
    // En producción los sirve el mismo servidor y este proxy no existe.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
