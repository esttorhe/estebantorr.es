// ABOUTME: Regenerates src/data/reading.json from the second-brain Obsidian vault's Knowledgebase/Books notes.
// ABOUTME: Downloads cover images into public/assets/images/reading/. Re-run manually whenever the vault changes — see grill-me notes in the /library/ commit for the migration rules this encodes.
//
// Usage:
//   bun run library:sync                    # uses the default sibling-repo vault path
//   bun run library:sync -- /path/to/Books   # explicit vault path

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const DEFAULT_VAULT_PATH = resolve(
  projectRoot,
  '..',
  'second_brain',
  'Knowledgebase',
  'Books',
);

const vaultPath = process.argv[2] ?? process.env.READING_VAULT_PATH ?? DEFAULT_VAULT_PATH;

const outputJsonPath = resolve(projectRoot, 'src', 'data', 'reading.json');
const coversDir = resolve(projectRoot, 'public', 'assets', 'images', 'reading');
const coversPublicPrefix = '/assets/images/reading';

// Manual overrides — map a vault note's filename stem (no .md) to a blog post
// slug (entry id under src/content/blog, no extension), for books you've
// actually written about on the site. Empty until one comes up.
const RELATED_POSTS = {};

function log(msg) {
  process.stdout.write(`[sync-reading] ${msg}\n`);
}

function stripWikilink(value) {
  if (typeof value !== 'string') return value;
  const match = value.match(/^\[\[(.+)\]\]$/);
  return match ? match[1] : value;
}

// Vault dates come in two shapes: a wikilink like "[[2026.01.04]]", or a bare
// "2026-01-04". Both normalize to plain ISO (YYYY-MM-DD) strings here.
function parseDate(value) {
  if (value == null || value === '') return undefined;
  const inner = stripWikilink(String(value));
  const normalized = inner.includes('.') ? inner.replace(/\./g, '-') : inner;
  if (Number.isNaN(new Date(normalized).getTime())) return undefined;
  return normalized;
}

function stripHtml(value) {
  if (typeof value !== 'string') return undefined;
  const text = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : undefined;
}

// seriesNumber is usually a bare YAML number, but a handful of vault entries
// quote it as a string (e.g. "2") — coerce those too instead of dropping them.
function parseSeriesNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function slugify(stem) {
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function loadFrontmatter(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return loadYaml(match[1]);
}

function extensionFromContentType(contentType) {
  if (!contentType) return null;
  if (contentType.includes('jpeg')) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return null;
}

// Maps a slug (no extension) to its existing filename in coversDir, e.g.
// "202601040000-all-systems-red" -> "202601040000-all-systems-red.jpg".
// Built once per run so re-syncs skip the network entirely for covers
// already on disk instead of re-downloading all ~300 every time.
async function existingCoversBySlug() {
  const entries = await readdir(coversDir);
  const bySlug = new Map();
  for (const entry of entries) {
    const dot = entry.lastIndexOf('.');
    if (dot === -1) continue;
    bySlug.set(entry.slice(0, dot), entry);
  }
  return bySlug;
}

async function downloadCover(url, destStem) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; estebantorr.es reading sync)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type');
  const urlExt = extname(new URL(url).pathname).replace('.', '');
  const ext = extensionFromContentType(contentType) || urlExt || 'jpg';
  const filename = `${destStem}.${ext}`;
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(resolve(coversDir, filename), buffer);
  return `${coversPublicPrefix}/${filename}`;
}

// Concurrency-limited map so we don't hammer Google Books / Amazon with
// hundreds of parallel requests.
async function mapWithConcurrency(items, limit, fn) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function main() {
  if (!existsSync(vaultPath)) {
    log(`Vault path not found: ${vaultPath}`);
    log('Pass one explicitly: bun run library:sync -- /path/to/Books');
    process.exitCode = 1;
    return;
  }

  await mkdir(coversDir, { recursive: true });

  const files = (await readdir(vaultPath)).filter((f) => f.endsWith('.md'));
  log(`Scanning ${files.length} notes in ${vaultPath}`);

  const finishedRaw = [];
  const currentlyReadingRaw = [];

  for (const file of files) {
    const fm = await loadFrontmatter(resolve(vaultPath, file));
    if (!fm) continue;

    const stem = file.replace(/\.md$/, '');
    const started = parseDate(fm.started);
    const finished = parseDate(fm.finished);
    const title = stem.replace(/^\d{12}\s*/, '').trim();
    const author = stripWikilink(fm.author) || 'Unknown';

    const base = {
      title,
      author,
      cover: fm.cover || undefined,
      format: fm.format === 'audiobook' ? 'audiobook' : 'book',
      series: fm.series || undefined,
      seriesNumber: parseSeriesNumber(fm.seriesNumber),
      relatedPost: RELATED_POSTS[stem],
      _stem: stem,
    };

    // In scope: finished (read:true with a finished date) or genuinely in
    // progress (started, not yet finished). Everything else — backlog
    // (read:false, never started), DNF (started === finished same-day
    // abandons) — is deliberately dropped; see grill-me notes.
    if (fm.read === true && finished) {
      finishedRaw.push({
        ...base,
        finished,
        rating: typeof fm.rating === 'number' ? fm.rating : undefined,
        favorite: fm.favorite === true ? true : undefined,
        review: stripHtml(fm.review),
      });
    } else if (started && !finished) {
      currentlyReadingRaw.push({ ...base, started });
    }
  }

  log(`In scope: ${finishedRaw.length} finished, ${currentlyReadingRaw.length} currently reading`);

  const all = [...finishedRaw, ...currentlyReadingRaw];
  const existing = await existingCoversBySlug();
  let downloaded = 0;
  let cached = 0;
  let failed = 0;

  await mapWithConcurrency(all, 6, async (book) => {
    if (!book.cover) return;
    const remoteUrl = book.cover;
    const slug = slugify(book._stem);
    const existingFilename = existing.get(slug);
    if (existingFilename) {
      book.cover = `${coversPublicPrefix}/${existingFilename}`;
      cached++;
      return;
    }
    try {
      book.cover = await downloadCover(remoteUrl, slug);
      downloaded++;
    } catch (err) {
      failed++;
      log(`Cover failed for "${book.title}" (${remoteUrl}): ${err.message} — keeping remote URL`);
      book.cover = remoteUrl;
    }
  });

  log(`Covers: ${downloaded} newly downloaded, ${cached} already cached (skipped), ${failed} failed (kept remote URL)`);

  function clean({ _stem, ...rest }) {
    return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  }

  const finished = finishedRaw
    .map(clean)
    .sort((a, b) => +new Date(b.finished) - +new Date(a.finished));
  const currentlyReading = currentlyReadingRaw
    .map(clean)
    .sort((a, b) => +new Date(b.started) - +new Date(a.started));

  await writeFile(outputJsonPath, `${JSON.stringify({ currentlyReading, finished }, null, 2)}\n`);
  log(`Wrote ${finished.length} finished + ${currentlyReading.length} currently-reading books to ${outputJsonPath}`);
}

main();
