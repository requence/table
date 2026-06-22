import { watch } from 'node:fs'
import { resolve } from 'node:path'
import { serve } from 'bun'
import index from './index.html'

const server = serve({
  port: 4001,
  routes: {
    '/*': index,
  },

  development: process.env.NODE_ENV !== 'production' && {
    hmr: true,
    console: true,
  },
})

console.log(`🚀 Server running at ${server.url}`)

/* ── Watch parent src/ for library changes ─────────────────────── */

const LIB_SRC = resolve(import.meta.dirname, '../../src')

let reloadTimer: ReturnType<typeof setTimeout> | undefined

watch(LIB_SRC, { recursive: true }, (_event, filename) => {
  if (!filename || filename.startsWith('.')) return

  // Debounce rapid successive FS events (editors often fire multiple)
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    console.log(`♻️  Library source changed: ${filename} — reloading…`)
    server.reload({ routes: { '/*': index } })
  }, 100)
})

console.log(`👀 Watching library source at ${LIB_SRC}`)
