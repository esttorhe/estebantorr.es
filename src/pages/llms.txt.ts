// ABOUTME: Serves /llms.txt, rendered at build time from the blog and TIL collections.
// ABOUTME: Body comes from src/lib/llmsTxt.ts; permalinks from src/lib/contentPaths.ts.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildLlmsTxt } from '../lib/llmsTxt';
import { postPath, tilPath } from '../lib/contentPaths';

export const GET: APIRoute = async ({ site }) => {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  const tils = await getCollection('til', ({ data }) => !data.draft);

  const body = buildLlmsTxt(site!, {
    posts: posts.map((p) => ({
      path: postPath(p.id, p.data.date),
      title: p.data.title,
      description: p.data.description,
      date: p.data.date,
    })),
    tils: tils.map((t) => ({
      path: tilPath(t.id),
      title: t.data.title,
      description: t.data.description,
      date: t.data.date,
    })),
  });

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
