// ABOUTME: RSS feed endpoint for estebantorr.es using @astrojs/rss.
// ABOUTME: Item shape preserves Hugo permalinks (/:year/:month/:title/) so existing subscribers keep working.

import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { getImage } from 'astro:assets';
import type { APIContext } from 'astro';
import { resolveHero } from '../lib/heroResolver';

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export async function GET(context: APIContext) {
  const site = context.site ?? new URL('https://estebantorr.es');
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  const tils = await getCollection('til', ({ data }) => !data.draft);

  const postItems = await Promise.all(
    posts.map(async (post) => {
      const date = new Date(post.data.date);
      const year = String(date.getFullYear());
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const titleSlug = post.id.replace(/^\d{4}-\d{2}-/, '').replace(/\.mdx?$/, '');

      // Mirror the post template: emit <media:content> when the post has a
      // raster hero so RSS readers (NetNewsWire, NewsBlur, Reeder, etc.) can
      // show an inline image without scraping og:image. Sigil-fallback heroes
      // are intentionally skipped — SVG support across readers is patchy.
      const heroResolution = resolveHero({
        slug: titleSlug,
        title: post.data.title,
        category: post.data.category,
        featuredImage: post.data.featured_image,
        featuredImageAlt: post.data.featured_image_alt,
      });

      let customData: string | undefined;
      if (heroResolution.kind === 'image') {
        const rendered = await getImage({
          src: heroResolution.image,
          width: 1200,
          format: 'jpg',
        });
        const url = new URL(rendered.src, site).toString();
        const width = rendered.attributes.width;
        const height = rendered.attributes.height;
        customData =
          `<media:content url="${xmlEscape(url)}" medium="image" type="image/jpeg"` +
          (width ? ` width="${width}"` : '') +
          (height ? ` height="${height}"` : '') +
          ` />`;
      }

      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: date,
        link: `/${year}/${month}/${titleSlug}/`,
        categories: [post.data.category, ...post.data.tags],
        customData,
      };
    }),
  );

  const tilItems = tils.map((til) => {
    const slug = til.id.replace(/^\d{4}-\d{2}-/, '').replace(/\.mdx?$/, '');
    return {
      title: til.data.title,
      description: til.data.description,
      pubDate: new Date(til.data.date),
      link: `/til/${slug}/`,
      categories: ['TIL', ...til.data.tags],
    };
  });

  const items = [...postItems, ...tilItems].sort((a, b) => +b.pubDate - +a.pubDate);

  return rss({
    title: 'The mind of Esteban',
    description:
      'Mostly engineering musings from the mind of a Costarrican who transplanted to Berlin.',
    site,
    items,
    xmlns: { media: 'http://search.yahoo.com/mrss/' },
    customData: '<language>en-us</language>',
  });
}
