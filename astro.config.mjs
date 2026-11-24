// ABOUTME: Astro configuration for estebantorr.es personal blog
// ABOUTME: Configures MDX, Tailwind CSS v4, sitemap, and markdown settings

// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { readContentEntries, lastmodIndex } from './src/lib/contentPaths.ts';

// Page path -> date its content last changed, from post and TIL frontmatter.
const lastmod = lastmodIndex(readContentEntries('./src/content'));

// https://astro.build/config
export default defineConfig({
  site: 'https://estebantorr.es',
  output: 'static',
  integrations: [
    mdx(),
    sitemap({
      // /cv/print/ is the PDF source — keep it out of the sitemap (the public CV is /cv/).
      filter: (page) => !/\/cv\/print\/?$/.test(page),
      // Content dates, not build time; pages with no dated content get no lastmod.
      serialize: (item) => {
        const date = lastmod.get(new URL(item.url).pathname);
        return date ? { ...item, lastmod: date } : item;
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
