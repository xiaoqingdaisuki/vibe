import assert from 'node:assert/strict';
import test from 'node:test';
import type { BlogPost } from '../../blog/types.ts';
import type { LabApp } from '../../lab/types.ts';
import { getRecentUpdates } from './get-recent-updates.ts';

const testApps: LabApp[] = [
  {
    slug: 'lab-update',
    title: 'Lab update',
    description: '',
    category: 'app',
    tags: [],
    href: '/lab/lab-update',
  },
];

const testPosts: BlogPost[] = [
  {
    slug: 'older-blog',
    title: 'Older blog',
    description: '',
    date: '2026-07-14',
    tags: [],
    category: 'Test',
    published: true,
    content: '',
  },
  {
    slug: 'latest-blog',
    title: 'Latest blog',
    description: '',
    date: '2026-07-14',
    tags: [],
    category: 'Test',
    published: true,
    content: '',
  },
];

test('getRecentUpdates preserves the three explicit homepage update references', () => {
  assert.deepEqual(
    getRecentUpdates({
      apps: testApps,
      posts: testPosts,
      references: [
        { kind: 'blog', slug: 'latest-blog' },
        { kind: 'lab', slug: 'lab-update' },
        { kind: 'blog', slug: 'older-blog' },
      ],
    }).map(({ kind, item }) => ({ kind, slug: item.slug })),
    [
      { kind: 'blog', slug: 'latest-blog' },
      { kind: 'lab', slug: 'lab-update' },
      { kind: 'blog', slug: 'older-blog' },
    ],
  );
});
