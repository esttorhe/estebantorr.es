// ABOUTME: Serves /robots.txt, rendered at build time from the configured site URL.
// ABOUTME: Body comes from src/lib/robots.ts.

import type { APIRoute } from 'astro';
import { buildRobotsTxt } from '../lib/robots';

export const GET: APIRoute = ({ site }) =>
  new Response(buildRobotsTxt(site!), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
