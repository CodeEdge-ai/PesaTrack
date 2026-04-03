import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/PesaTrack/',           // ← THIS LINE WAS MISSING (critical fix)
  build: {
    outDir: 'dist'
  }
})
