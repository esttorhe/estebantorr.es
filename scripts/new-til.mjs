// ABOUTME: Interactive scaffolder for new TIL entries. Prompts for metadata, slugifies the title, and writes a valid MDX file under src/content/til/.
// ABOUTME: Run via `mise run new-til` from the project root.

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const tilDir = resolve(projectRoot, 'src', 'content', 'til');

const rl = createInterface({ input: stdin, output: stdout });

function log(msg) {
  process.stdout.write(`[new-til] ${msg}\n`);
}

async function ask(question, { required = false } = {}) {
  while (true) {
    const answer = (await rl.question(`${question}: `)).trim();
    if (answer) return answer;
    if (!required) return '';
    log('  field is required');
  }
}

async function askYesNo(question, defaultYes = true) {
  const suffix = defaultYes ? ' (Y/n)' : ' (y/N)';
  const answer = (await rl.question(`${question}${suffix}: `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith('y');
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Single-quoted YAML string, with `'` escaped as `''`. Safe for any title we'd realistically use.
function yamlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  process.stdout.write('\nNew TIL entry scaffolder\n\n');

  const title = await ask('title', { required: true });
  const slug = slugify(title);
  if (!slug) {
    log('title produced an empty slug; aborting');
    process.exit(1);
  }
  log(`  slug → ${slug}`);

  const description = await ask('description (one-sentence takeaway — shown on the index)', {
    required: true,
  });
  const tagsRaw = await ask('tags (comma-separated, optional)');
  const tags = tagsRaw
    ? tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const draft = await askYesNo('save as draft?', true);

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const isoDate = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const fileName = `${year}-${month}-${slug}.mdx`;
  const filePath = resolve(tilDir, fileName);
  if (await pathExists(filePath)) {
    log(`entry already exists: ${filePath}`);
    process.exit(1);
  }

  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    `date: ${isoDate}`,
    `description: ${yamlString(description)}`,
  ];
  if (tags.length) {
    frontmatter.push('tags:');
    for (const tag of tags) frontmatter.push(`  - ${tag}`);
  }
  if (draft) frontmatter.push('draft: true');
  frontmatter.push('---', '', description, '');

  await mkdir(tilDir, { recursive: true });
  await writeFile(filePath, frontmatter.join('\n'), 'utf8');

  process.stdout.write(
    `\n[new-til] created src/content/til/${fileName}${draft ? ' (draft)' : ''}\n\n`,
  );
}

main()
  .catch((err) => {
    log(err.stack || err.message || String(err));
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });
