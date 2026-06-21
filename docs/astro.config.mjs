import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: { plugins: [tailwindcss()] },
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
            { label: 'useTableColumnWidths', slug: 'reference/03-use-table-column-widths' },
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
});
