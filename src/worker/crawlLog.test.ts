// ABOUTME: Tests for the AI-crawler access log — bot matching, the Peec log entry, and the webhook request.
// ABOUTME: Run with `bun test`.

import { test, expect } from 'bun:test';
import {
  isAiCrawler,
  accessLogEntry,
  peecRequestInit,
  PEEC_GENERIC_ACCESS_LOG_URL,
} from './crawlLog';

const GPTBOT_UA =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot';
const FIREFOX_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.1; rv:133.0) Gecko/20100101 Firefox/133.0';

// ---------------------------------------------------------------------------
// isAiCrawler
// ---------------------------------------------------------------------------

test('AI crawlers match', () => {
  expect(isAiCrawler(GPTBOT_UA)).toBe(true);
  expect(isAiCrawler('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)')).toBe(
    true,
  );
  expect(isAiCrawler('Mozilla/5.0 (compatible; PerplexityBot/1.0)')).toBe(true);
  expect(isAiCrawler('Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)')).toBe(
    true,
  );
});

test('matching ignores case, like Peec does at ingest', () => {
  expect(isAiCrawler('gptbot/1.2')).toBe(true);
  expect(isAiCrawler('OAI-SEARCHBOT/1.0')).toBe(true);
});

// Human traffic never leaves the Worker: no visitor IPs or user agents go to Peec.
test('browsers and missing user agents do not match', () => {
  expect(isAiCrawler(FIREFOX_UA)).toBe(false);
  expect(isAiCrawler('')).toBe(false);
  expect(isAiCrawler(null)).toBe(false);
});

// ---------------------------------------------------------------------------
// accessLogEntry
// ---------------------------------------------------------------------------

const NOW = new Date('2026-11-24T10:00:00.000Z');

function crawlerRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://estebantorr.es/2024/05/some-post/?ref=x', {
    method: 'GET',
    headers: { 'User-Agent': GPTBOT_UA, ...headers },
  });
}

test('an entry carries the fields Peec requires', () => {
  expect(accessLogEntry(crawlerRequest(), 200, undefined, NOW)).toEqual({
    timestamp: '2026-11-24T10:00:00.000Z',
    request_method: 'GET',
    request_url: 'https://estebantorr.es/2024/05/some-post/?ref=x',
    response_status: 200,
    user_agent: GPTBOT_UA,
  });
});

test('optional fields are included when present', () => {
  const request = crawlerRequest({
    'CF-Connecting-IP': '20.171.207.1',
    Referer: 'https://chatgpt.com/',
  });
  expect(accessLogEntry(request, 404, 'US', NOW)).toEqual({
    timestamp: '2026-11-24T10:00:00.000Z',
    request_method: 'GET',
    request_url: 'https://estebantorr.es/2024/05/some-post/?ref=x',
    response_status: 404,
    user_agent: GPTBOT_UA,
    country_code: 'US',
    client_ip: '20.171.207.1',
    referer: 'https://chatgpt.com/',
  });
});

// Peec validates country_code against ISO 3166 alpha-2 codes. Cloudflare also
// reports XX (unknown) and T1 (Tor), which would get the entry rejected.
test('country codes Peec would reject are left out', () => {
  expect(accessLogEntry(crawlerRequest(), 200, 'XX', NOW).country_code).toBeUndefined();
  expect(accessLogEntry(crawlerRequest(), 200, 'T1', NOW).country_code).toBeUndefined();
  expect(accessLogEntry(crawlerRequest(), 200, '', NOW).country_code).toBeUndefined();
});

// ---------------------------------------------------------------------------
// peecRequestInit
// ---------------------------------------------------------------------------

test('the webhook goes to the generic access log endpoint', () => {
  expect(PEEC_GENERIC_ACCESS_LOG_URL).toBe(
    'https://api.peec.ai/agent-analytics/generic-access-log',
  );
});

test('the webhook request is an authenticated POST of a one-entry array', () => {
  const entry = accessLogEntry(crawlerRequest(), 200, undefined, NOW);
  const init = peecRequestInit(entry, { apiKey: 'key-123', orgId: 'org-456' });

  expect(init.method).toBe('POST');
  expect(init.headers).toEqual({
    Authorization: 'Bearer key-123',
    'x-org-id': 'org-456',
    'Content-Type': 'application/json',
  });
  expect(JSON.parse(init.body as string)).toEqual([entry]);
});
