import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import chatHandler from './api/chat.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY
  }

  return {
    plugins: [
      react(),
      {
        name: 'local-vercel-api-middleware',
        configureServer(server) {
          server.middlewares.use('/api/chat', async (req, res) => {
            const currentEnv = loadEnv(mode, process.cwd(), '')
            if (currentEnv.OPENAI_API_KEY) {
              process.env.OPENAI_API_KEY = currentEnv.OPENAI_API_KEY
            }
            await chatHandler(req, res)
          })
        },
      },
    ],
  }
})
