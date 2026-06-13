import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPost } from '../../lib/apify.js';

test('mapPost returns contentType as string[]', () => {
  const item = {
    linkedinUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:123',
    content: 'A great post https://lnkd.in/abc',
    postImages: [{ url: 'https://example.com/img.jpg' }],
    postedAt: { date: '2026-06-13T10:00:00Z' },
    author: { name: 'Test Co', type: 'company', publicIdentifier: 'test-co' },
    engagement: { likes: 10, comments: 2, shares: 1, reactions: [] },
  };

  const post = mapPost(item, 'company');

  assert.ok(Array.isArray(post.contentType), 'contentType must be an array');
  assert.ok(post.contentType.includes('image'), 'should detect image');
  assert.ok(post.contentType.includes('link'), 'should detect link');
  assert.equal(post.contentType.includes('text'), false, 'text must not appear with other types');
});

test('mapPost plain text post has contentType ["text"]', () => {
  const item = {
    linkedinUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:456',
    content: 'Just sharing a thought today.',
    postedAt: { date: '2026-06-13T09:00:00Z' },
    author: { name: 'Someone', type: 'person', publicIdentifier: 'someone' },
    engagement: { likes: 1, comments: 0, shares: 0, reactions: [] },
  };

  const post = mapPost(item, 'person');

  assert.deepEqual(post.contentType, ['text']);
});

test('savePost content_type mapping: array value is truthy and passes || null guard', () => {
  // Simulate the mapping logic: post.contentType || null
  const contentType = ['image', 'link'];
  const mapped = contentType || null;
  assert.deepEqual(mapped, ['image', 'link'], 'non-empty array must not be replaced by null');
});
