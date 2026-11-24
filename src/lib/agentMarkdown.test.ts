// ABOUTME: Tests for converting a built HTML page into the Markdown served to agents.
// ABOUTME: Snippets are copied from real dist/ output (shortcodes, Shiki code, post chrome). Run with `bun test`.

import { test, expect } from 'bun:test';
import { load as loadYaml } from 'js-yaml';
import { pageToMarkdown, isIndexedPage } from './agentMarkdown';

const site = new URL('https://estebantorr.es');

/** Wraps real <main> content in the head BaseLayout emits. */
function page(
  main: string,
  head: { title: string; path: string; jsonLd?: object } = {
    title: 'Swift 2.0 - throws tip — The mind of Esteban',
    path: '/2015/06/swift-2-throws-tip/',
  },
) {
  return `<!doctype html><html lang="en"><head>
<title>${head.title}</title>
<meta name="description" content="A quick tip on documenting what errors your Swift 2.0 throwing functions can throw.">
<link rel="canonical" href="https://estebantorr.es${head.path}">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","@id":"https://estebantorr.es/#website"}]}</script>
${head.jsonLd ? `<script type="application/ld+json">${JSON.stringify(head.jsonLd)}</script>` : ''}
</head><body><header class="site-header"><nav>Writing</nav></header>
<main id="main" class="page-main">${main}</main>
<footer class="site-footer">footer</footer></body></html>`;
}

const POSTING = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Swift 2.0 - throws tip',
  datePublished: '2015-06-14T00:00:00.000Z',
  author: { '@id': 'https://estebantorr.es/#person', name: 'Esteban Torres' },
  // src/lib/jsonLd.ts writes keywords as one comma-separated string.
  keywords: 'swift, errors',
};

function frontMatter(md: string): Record<string, unknown> {
  const match = md.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match).not.toBeNull();
  return loadYaml(match![1]) as Record<string, unknown>;
}

const ARTICLE_HEADER = `<header class="article__header reveal" data-astro-cid-xryxkhjy> <p class="article__meta" data-astro-cid-xryxkhjy> <time datetime="2015-06-14T00:00:00.000Z" class="article__date tabular dt-published" data-astro-cid-xryxkhjy> 14 June 2015 </time>  <data class="u-url" value="https://estebantorr.es/2015/06/swift-2-throws-tip/" data-astro-cid-xryxkhjy></data> <span aria-hidden="true" class="article__sep" data-astro-cid-xryxkhjy>·</span> <span class="article__category" data-astro-cid-xryxkhjy>Tech</span> <span aria-hidden="true" class="article__sep" data-astro-cid-xryxkhjy>·</span> <span class="article__reading tabular" data-astro-cid-xryxkhjy>2 min read</span> </p> <h1 class="article__title p-name" data-astro-cid-xryxkhjy>Swift 2.0 - throws tip</h1> <div class="p-author h-card author-hcard" data-astro-cid-jutfl26h> <data class="p-name" value="Esteban Torres" data-astro-cid-jutfl26h></data> <data class="u-url u-uid" value="https://estebantorr.es/" data-astro-cid-jutfl26h></data> </div>  <p class="article__lede p-summary" data-astro-cid-xryxkhjy>A quick tip on documenting what errors your Swift 2.0 throwing functions can throw.</p> </header>`;

const HERO = `<figure class="article-hero article-hero--image" aria-label="Hero illustration for Swift 2.0 - throws tip" data-astro-cid-wdpkpoa2> <img src="/_astro/swift-2-throws-tip.DcOn5FhM_yYBxz.webp" srcset="/_astro/swift-2-throws-tip.DcOn5FhM_Z5N1vP.webp 480w" alt="Hero illustration for Swift 2.0 - throws tip" width="1264" height="848"> </figure>`;

const POST_NAV = `<nav class="post-nav" aria-label="More writing" data-astro-cid-boskcsze> <ul class="post-nav__list" data-astro-cid-boskcsze> <li class="post-nav__item" data-astro-cid-boskcsze> <a class="post-nav__link" href="/2015/06/hidden-error-variable/" rel="next" data-astro-cid-boskcsze> <span class="post-nav__framing" data-astro-cid-boskcsze>Next read</span> <span class="post-nav__pointer" aria-hidden="true" data-astro-cid-boskcsze>
→
</span> <span class="post-nav__title" data-astro-cid-boskcsze>Hidden error variable on exhaustive block</span> </a> </li> </ul> </nav>`;

const RESPONSES = `<section class="responses" aria-labelledby="responses-heading" data-astro-cid-qwx2iz6g><header class="responses__header" data-astro-cid-qwx2iz6g><h2 id="responses-heading" class="responses__title" data-astro-cid-qwx2iz6g>
Responses
</h2><p class="responses__invite">Wrote about this?</p></header><form class="responses__form" action="https://webmention.io/estebantorr.es/webmention" method="post"><input name="source"></form></section>`;

const TWEET = `<figure class="shortcode-tweet" data-astro-cid-5tw7iky7> <blockquote data-astro-cid-5tw7iky7> <p>I would trade throws for sum types with pattern matching in a heartbeat. #swift</p> </blockquote> <figcaption data-astro-cid-5tw7iky7> <span class="tweet-author" data-astro-cid-5tw7iky7>Rob Rix</span> <span aria-hidden="true" class="tweet-sep" data-astro-cid-5tw7iky7>·</span> <a class="tweet-handle" href="https://twitter.com/rob_rix" rel="noopener noreferrer" data-astro-cid-5tw7iky7>@rob_rix</a>  <span aria-hidden="true" class="tweet-sep" data-astro-cid-5tw7iky7>
·
</span> <time class="tweet-date" data-astro-cid-5tw7iky7>June 8, 2015</time>  </figcaption> </figure>`;

const TERMINAL = `<figure class="shortcode-terminal" data-prompt="$" data-astro-cid-ht4flnls> <pre data-astro-cid-ht4flnls><code data-astro-cid-ht4flnls><p>pod install</p></code></pre> </figure>`;

const GITHUB = `<p>See <a class="shortcode-github" href="https://github.com/esttorhe/Localizer/commit/3831a7" rel="noopener noreferrer" target="_blank" data-astro-cid-5ekepxqw> <svg class="shortcode-github__icon" viewBox="0 0 16 16" aria-hidden="true" width="14" height="14" fill="currentColor"> <path d="M8 0C3.58 0 0 3.58 0 8z"></path> </svg> <span class="shortcode-github__path" data-astro-cid-5ekepxqw> <span class="shortcode-github__owner" data-astro-cid-5ekepxqw>esttorhe</span><span class="shortcode-github__slash" data-astro-cid-5ekepxqw>/</span><span class="shortcode-github__repo" data-astro-cid-5ekepxqw>Localizer</span> </span>  <span aria-hidden="true" class="shortcode-github__sep" data-astro-cid-5ekepxqw>
@
</span> <span class="shortcode-github__commit" data-astro-cid-5ekepxqw>3831a7</span>  </a></p>`;

const SHIKI = `<pre class="astro-code astro-code-themes github-light github-dark" style="background-color:#fff" tabindex="0" data-language="swift"><code><span class="line"><span style="color:#6A737D">/**</span></span>
<span class="line"><span style="color:#6A737D">Do something nice here.</span></span>
<span class="line"><span style="color:#D73A49">func</span><span style="color:#6F42C1"> dragon</span><span>()</span></span></code></pre>`;

const POST = page(
  `<article class="article h-entry">${ARTICLE_HEADER}${HERO}<div class="prose e-content"><p>Read <a href="/2014/12/new-year-resolutions/">this</a>.</p>${TWEET}${TERMINAL}${GITHUB}${SHIKI}</div>${POST_NAV}${RESPONSES}</article>`,
  {
    title: 'Swift 2.0 - throws tip — The mind of Esteban',
    path: '/2015/06/swift-2-throws-tip/',
    jsonLd: POSTING,
  },
);

// ---------------------------------------------------------------------------
// Front matter
// ---------------------------------------------------------------------------

test('posts get front matter from the page head and their BlogPosting JSON-LD', () => {
  expect(frontMatter(pageToMarkdown(POST, site))).toEqual({
    title: 'Swift 2.0 - throws tip',
    url: 'https://estebantorr.es/2015/06/swift-2-throws-tip/',
    description:
      'A quick tip on documenting what errors your Swift 2.0 throwing functions can throw.',
    author: 'Esteban Torres',
    published: '2015-06-14',
    tags: ['swift', 'errors'],
  });
});

test('pages without a BlogPosting carry title, url and description only', () => {
  const md = pageToMarkdown(
    page('<h1>About</h1><p>Hi.</p>', { title: 'About — The mind of Esteban', path: '/about/' }),
    site,
  );
  expect(frontMatter(md)).toEqual({
    title: 'About',
    url: 'https://estebantorr.es/about/',
    description:
      'A quick tip on documenting what errors your Swift 2.0 throwing functions can throw.',
  });
});

test('the bare site name stays as the title on the home page', () => {
  const md = pageToMarkdown(
    page('<h1>Home</h1>', { title: 'The mind of Esteban', path: '/' }),
    site,
  );
  expect(frontMatter(md).title).toBe('The mind of Esteban');
});

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

const md = pageToMarkdown(POST, site);
const body = md.slice(md.indexOf('\n---\n') + 5);

test('only <main> is converted: no site header or footer', () => {
  expect(body).not.toContain('footer');
  expect(body).not.toContain('Writing\n');
});

test('the title becomes the H1 and the lede stays', () => {
  expect(body).toContain('# Swift 2.0 - throws tip');
  expect(body).toContain('A quick tip on documenting what errors');
});

test('the meta line, author h-card and webmentions are dropped', () => {
  expect(body).not.toContain('2 min read');
  expect(body).not.toContain('Responses');
  expect(body).not.toContain('webmention.io');
});

test('the hero image keeps its alt text and becomes absolute', () => {
  expect(body).toContain(
    '![Hero illustration for Swift 2.0 - throws tip](https://estebantorr.es/_astro/swift-2-throws-tip.DcOn5FhM_yYBxz.webp)',
  );
});

test('relative links become absolute', () => {
  expect(body).toContain('[this](https://estebantorr.es/2014/12/new-year-resolutions/)');
});

test('a tweet quote keeps its attribution inside the blockquote, without decorative separators', () => {
  expect(body).toContain(
    '> I would trade throws for sum types with pattern matching in a heartbeat. #swift',
  );
  expect(body).toContain('> — Rob Rix [@rob_rix](https://twitter.com/rob_rix) June 8, 2015');
  expect(body).not.toContain('·');
});

test('a terminal block becomes a shell code block', () => {
  expect(body).toContain('```sh\npod install\n```');
});

test('a GitHub card becomes a plain link without the icon or the decorative @', () => {
  expect(body).toContain(
    '[esttorhe/Localizer 3831a7](https://github.com/esttorhe/Localizer/commit/3831a7)',
  );
});

test('Shiki code blocks keep their language and plain text', () => {
  expect(body).toContain('```swift\n/**\nDo something nice here.\nfunc dragon()\n```');
});

test('previous/next navigation stays as links', () => {
  expect(body).toContain(
    '[Next read Hidden error variable on exhaustive block](https://estebantorr.es/2015/06/hidden-error-variable/)',
  );
});

test('the JSON-LD is appended as one fenced json block', () => {
  const tail = body.slice(body.lastIndexOf('```json'));
  expect(tail).toContain('"@type":"BlogPosting"');
  expect(tail).toContain('"@type":"WebSite"');
  expect(tail.trimEnd().endsWith('```')).toBe(true);
});

// ---------------------------------------------------------------------------
// isIndexedPage
// ---------------------------------------------------------------------------

// Same rule as the sitemap: every page except the CV print source.
test('every sitemap page gets Markdown, the CV print source does not', () => {
  expect(isIndexedPage('/')).toBe(true);
  expect(isIndexedPage('/2015/06/swift-2-throws-tip/')).toBe(true);
  expect(isIndexedPage('/library/2019/')).toBe(true);
  expect(isIndexedPage('/cv/print/')).toBe(false);
  expect(isIndexedPage('/cv/print')).toBe(false);
});
