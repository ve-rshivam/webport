import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'vercel-redirects',
      writeBundle() {
        const redirects = '/* /index.html 200\n'
        fs.writeFileSync(path.join('dist', '_redirects'), redirects)
      }
    }
  ],
})
