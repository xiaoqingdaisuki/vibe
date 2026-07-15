import assert from 'node:assert/strict';
import test from 'node:test';
import { getBlogPosts } from '../../blog/lib/posts.ts';
import type { BlogPost } from '../../blog/types.ts';
import { labApps } from '../../lab/registry.ts';
import type { LabApp } from '../../lab/types.ts';
import { getRecentUpdates } from './get-recent-updates.ts';

const testApps: LabApp[] = [
  {
    slug: 'fourth-lab',
    title: 'Fourth Lab',
    description: '',
    category: 'app',
    tags: [],
    href: '/lab/fourth-lab',
    recentOrder: 4,
  },
  {
    slug: 'first-lab',
    title: 'First Lab',
    description: '',
    category: 'app',
    tags: [],
    href: '/lab/first-lab',
    recentOrder: 1,
  },
  {
    slug: 'unmarked-lab',
    title: 'Unmarked Lab',
    description: '',
    category: 'app',
    tags: [],
    href: '/lab/unmarked-lab',
  },
];

const testPosts: BlogPost[] = [
  {
    slug: 'second-blog',
    title: 'Second Blog',
    description: '',
    date: '2026-07-14',
    tags: [],
    category: 'Test',
    published: true,
    content: '',
    recentOrder: 2,
  },
  {
    slug: 'third-blog',
    title: 'Third Blog',
    description: '',
    date: '2026-07-14',
    tags: [],
    category: 'Test',
    published: true,
    content: '',
    recentOrder: 3,
  },
  {
    slug: 'unmarked-blog',
    title: 'Unmarked Blog',
    description: '',
    date: '2026-07-14',
    tags: [],
    category: 'Test',
    published: true,
    content: '',
  },
];

test('getRecentUpdates combines manually ordered Lab and Blog items, excluding unmarked items and limiting results to three', () => {
  assert.deepEqual(
    getRecentUpdates({ apps: testApps, posts: testPosts }).map(({ kind, item }) => ({ kind, slug: item.slug })),
    [
      { kind: 'lab', slug: 'first-lab' },
      { kind: 'blog', slug: 'second-blog' },
      { kind: 'blog', slug: 'third-blog' },
    ],
  );
});

test('getRecentUpdates selects the current homepage updates in global recentOrder', () => {
  assert.deepEqual(
    getRecentUpdates({ apps: labApps, posts: getBlogPosts() }).map(({ kind, item }) => `${kind}:${item.slug}`),
    ['lab:minesweeper', 'blog:git-commit-guidelines', 'lab:rss'],
  );
});
