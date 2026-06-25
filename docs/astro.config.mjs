import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    server: { fs: { allow: ['..'] } },
    resolve: {
      alias: {
        '@requence/table': resolve(__dirname, '../src/index.ts'),
        '@example/TableDemo.tsx': resolve(
          __dirname,
          '../example/src/TableDemo.tsx',
        ),
      },
      dedupe: ['react', 'react-dom'],
    },
  },
  // Explicit `gfm: true` is required for @astrojs/mdx on Astro ≥6.4 — the
  // schema changed from `.default(true)` to `.optional()`, so `config.markdown.gfm`
  // is `undefined` unless set, and the MDX plugin treats `undefined` as falsy.
  // The deprecation warning is harmless; remove once @astrojs/mdx fixes this.
  markdown: { gfm: true },
  integrations: [
    react(),
    starlight({
      title: 'Table',
      logo: { src: './public/requence-wordmark.svg', replacesTitle: false },
      favicon: '/logo.svg',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/requence/table',
        },
      ],
      expressiveCode: {
        themes: ['dark-plus'],
        styleOverrides: {
          borderColor: 'var(--color-zinc-700)',
          borderRadius: '0.375rem',
          codeBackground: '#09090b',
        },
      },
      customCss: ['./src/styles/custom.css'],
      components: {
        PageFrame: './src/components/overrides/PageFrame.astro',
        ThemeSelect: './src/components/overrides/ThemeSelect.astro',
      },
      sidebar: [
        {
          label: 'Concepts',
          items: [
            { label: 'Introduction', slug: 'concepts/01-introduction' },
            { label: 'Virtual Table', slug: 'concepts/02-virtual-table' },
            { label: 'Data Caching', slug: 'concepts/03-data-caching' },
            { label: 'Column Widths', slug: 'concepts/04-column-widths' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'VirtualTable', slug: 'reference/01-virtual-table' },
            { label: 'useTableCache', slug: 'reference/02-use-table-cache' },
            {
              label: 'useTableColumnWidths',
              slug: 'reference/03-use-table-column-widths',
            },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Basic Table', slug: 'guides/01-basic-table' },
          ],
        },
      ],
    }),
  ],
})
