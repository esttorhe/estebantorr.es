// ABOUTME: Astro integration that writes an index.md next to every built page once the build is done.
// ABOUTME: The Markdown is what agents get (via the Worker's content negotiation); conversion lives in src/lib/agentMarkdown.ts.

import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { writeAgentMarkdown } from '../lib/agentMarkdownBuild';

export function agentMarkdown(): AstroIntegration {
  let site: URL | undefined;
  return {
    name: 'agent-markdown',
    hooks: {
      'astro:config:done': ({ config }) => {
        site = config.site ? new URL(config.site) : undefined;
      },
      'astro:build:done': ({ dir, pages, logger }) => {
        if (!site) throw new Error('agent-markdown needs `site` set in astro.config.mjs');
        const written = writeAgentMarkdown(
          fileURLToPath(dir),
          pages.map((page) => page.pathname),
          site,
        );
        logger.info(`wrote ${written} index.md files`);
      },
    },
  };
}
