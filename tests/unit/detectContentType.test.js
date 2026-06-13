import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectContentType } from '../../lib/apify.js';

// --- single-type scenarios ---

test('image-only post', () => {
  const src = { postImages: [{ url: 'https://example.com/img.jpg' }] };
  assert.deepEqual(detectContentType(src), ['image']);
});

test('video-only post', () => {
  const src = { postVideo: { url: 'https://example.com/v.mp4' } };
  assert.deepEqual(detectContentType(src), ['video']);
});

test('document-only post', () => {
  const src = { document: { url: 'https://example.com/doc.pdf' } };
  assert.deepEqual(detectContentType(src), ['document']);
});

test('article-only post', () => {
  const src = { article: { title: 'My Article', link: 'https://example.com/a' } };
  assert.deepEqual(detectContentType(src), ['article']);
});

test('link-only post (URL in content)', () => {
  const src = { content: 'Check this out https://lnkd.in/abc123 great post' };
  assert.deepEqual(detectContentType(src), ['link']);
});

test('repost-only (header.text contains "reposted")', () => {
  const src = { header: { text: 'John Doe reposted this' } };
  assert.deepEqual(detectContentType(src), ['repost']);
});

test('repost detection is case-insensitive', () => {
  const src = { header: { text: 'Jane REPOSTED this article' } };
  assert.deepEqual(detectContentType(src), ['repost']);
});

test('plain text fallback when nothing matches', () => {
  const src = { content: 'Just a plain text post with no URL' };
  assert.deepEqual(detectContentType(src), ['text']);
});

test('null/undefined src returns ["text"]', () => {
  assert.deepEqual(detectContentType(null), ['text']);
  assert.deepEqual(detectContentType(undefined), ['text']);
  assert.deepEqual(detectContentType({}), ['text']);
});

// --- multi-type scenarios ---

test('image + link combined', () => {
  const src = {
    postImages: [{ url: 'https://example.com/img.jpg' }],
    content: 'See https://lnkd.in/xyz for details',
  };
  const result = detectContentType(src);
  assert.ok(result.includes('image'), 'should include image');
  assert.ok(result.includes('link'), 'should include link');
  assert.equal(result.includes('text'), false, 'should not include text');
});

test('video + repost combined', () => {
  const src = {
    postVideo: { url: 'https://example.com/v.mp4' },
    header: { text: 'Someone reposted this video' },
  };
  const result = detectContentType(src);
  assert.ok(result.includes('video'), 'should include video');
  assert.ok(result.includes('repost'), 'should include repost');
  assert.equal(result.includes('text'), false, 'should not include text');
});

// --- invariant: "text" never combined ---

test('"text" is never combined with other types', () => {
  const cases = [
    { postImages: [{}], content: 'https://lnkd.in/x' },
    { postVideo: {} },
    { document: {} },
    { article: {} },
  ];
  for (const src of cases) {
    const result = detectContentType(src);
    if (result.length > 1 || (result.length === 1 && result[0] !== 'text')) {
      assert.equal(result.includes('text'), false, `"text" must not appear with other types for src: ${JSON.stringify(src)}`);
    }
  }
});
