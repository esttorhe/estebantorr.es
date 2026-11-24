// ABOUTME: CI gate: fails when any sitemap page in dist/ lacks a valid index.md or leaks dropped content.
// ABOUTME: Run after `bun run build` with `bun run markdown:check`; logic lives in src/lib/agentMarkdownBuild.ts.

import { checkAgentMarkdown } from '../src/lib/agentMarkdownBuild';

const problems = checkAgentMarkdown('dist');
if (problems.length > 0) {
  console.error(`Agent Markdown check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log('Agent Markdown check passed.');
