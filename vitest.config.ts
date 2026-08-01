import { defineConfig } from 'vitest/config'

// Config propia: la de Vite tiene `root: src/web` para el front, y con ese root
// Vitest no encontraría los tests del motor, que viven en src/core.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
