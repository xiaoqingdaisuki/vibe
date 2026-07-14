import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { getBlogPostBySlug, getBlogPosts } from './posts.ts';

const BLOG_DIR = path.join(process.cwd(), 'src/content/blog');
const TEMP_POST_SLUG = 'temp-md-post';
const TEMP_POST_PATH = path.join(BLOG_DIR, `${TEMP_POST_SLUG}.md`);
const TEMP_PINNED_POST_SLUG = 'temp-pinned-post';
const TEMP_PINNED_POST_PATH = path.join(BLOG_DIR, `${TEMP_PINNED_POST_SLUG}.md`);
const TEMP_NEWER_POST_SLUG = 'temp-newer-post';
const TEMP_NEWER_POST_PATH = path.join(BLOG_DIR, `${TEMP_NEWER_POST_SLUG}.md`);
const TEMP_EXPLICITLY_UNPINNED_POST_SLUG = 'temp-a-explicitly-unpinned-post';
const TEMP_EXPLICITLY_UNPINNED_POST_PATH = path.join(BLOG_DIR, `${TEMP_EXPLICITLY_UNPINNED_POST_SLUG}.md`);
const TEMP_OMITTED_PINNED_POST_SLUG = 'temp-z-omitted-pinned-post';
const TEMP_OMITTED_PINNED_POST_PATH = path.join(BLOG_DIR, `${TEMP_OMITTED_PINNED_POST_SLUG}.md`);
const TEMP_RECENT_POST_SLUG = 'temp-recent-post';
const TEMP_RECENT_POST_PATH = path.join(BLOG_DIR, `${TEMP_RECENT_POST_SLUG}.md`);
const TEMP_INVALID_RECENT_POST_SLUG = 'temp-invalid-recent-post';
const TEMP_INVALID_RECENT_POST_PATH = path.join(BLOG_DIR, `${TEMP_INVALID_RECENT_POST_SLUG}.md`);

test('getBlogPostBySlug supports .md posts as well as .mdx', () => {
  fs.writeFileSync(
    TEMP_POST_PATH,
    `---
title: "Temporary Markdown Post"
description: "Used for a regression test."
date: "2026-07-06"
tags: ["test"]
category: "Test"
published: true
---

# Markdown Title
`,
    'utf-8',
  );

  try {
    const post = getBlogPostBySlug(TEMP_POST_SLUG);

    assert.ok(post);
    assert.equal(post.slug, TEMP_POST_SLUG);
    assert.match(post.content, /# Markdown Title/);
  } finally {
    fs.rmSync(TEMP_POST_PATH, { force: true });
  }
});

test('getBlogPostBySlug rejects invalid frontmatter instead of returning malformed data', () => {
  fs.writeFileSync(
    TEMP_POST_PATH,
    `---
title: "Temporary Markdown Post"
description: "Used for a regression test."
date: "2026-07-06"
tags: "test"
category: "Test"
published: true
---

# Markdown Title
`,
    'utf-8',
  );

  try {
    const post = getBlogPostBySlug(TEMP_POST_SLUG);
    const posts = getBlogPosts();

    assert.equal(post, null);
    assert.equal(
      posts.some((entry) => entry.slug === TEMP_POST_SLUG),
      false,
    );
  } finally {
    fs.rmSync(TEMP_POST_PATH, { force: true });
  }
});

test('getBlogPosts lists pinned posts before newer standard posts', () => {
  fs.writeFileSync(
    TEMP_PINNED_POST_PATH,
    `---
title: "Pinned Post"
description: "Used for a sorting regression test."
date: "2000-01-01"
tags: ["test"]
category: "Test"
published: true
pinned: true
---

# Pinned Post
`,
    'utf-8',
  );
  fs.writeFileSync(
    TEMP_NEWER_POST_PATH,
    `---
title: "Newer Post"
description: "Used for a sorting regression test."
date: "2099-01-01"
tags: ["test"]
category: "Test"
published: true
---

# Newer Post
`,
    'utf-8',
  );

  try {
    const posts = getBlogPosts();
    const pinnedPostIndex = posts.findIndex((post) => post.slug === TEMP_PINNED_POST_SLUG);
    const newerPostIndex = posts.findIndex((post) => post.slug === TEMP_NEWER_POST_SLUG);

    assert.ok(pinnedPostIndex >= 0);
    assert.ok(newerPostIndex >= 0);
    assert.ok(pinnedPostIndex < newerPostIndex);
  } finally {
    fs.rmSync(TEMP_PINNED_POST_PATH, { force: true });
    fs.rmSync(TEMP_NEWER_POST_PATH, { force: true });
  }
});

test('getBlogPosts sorts explicit and omitted unpinned posts by date', () => {
  fs.writeFileSync(
    TEMP_EXPLICITLY_UNPINNED_POST_PATH,
    `---
title: "Explicitly Unpinned Post"
description: "Used for a sorting regression test."
date: "2000-01-01"
tags: ["test"]
category: "Test"
published: true
pinned: false
---

# Explicitly Unpinned Post
`,
    'utf-8',
  );
  fs.writeFileSync(
    TEMP_OMITTED_PINNED_POST_PATH,
    `---
title: "Omitted Pinned Post"
description: "Used for a sorting regression test."
date: "2099-01-01"
tags: ["test"]
category: "Test"
published: true
---

# Omitted Pinned Post
`,
    'utf-8',
  );

  try {
    const posts = getBlogPosts();
    const explicitlyUnpinnedPostIndex = posts.findIndex((post) => post.slug === TEMP_EXPLICITLY_UNPINNED_POST_SLUG);
    const omittedPinnedPostIndex = posts.findIndex((post) => post.slug === TEMP_OMITTED_PINNED_POST_SLUG);

    assert.ok(explicitlyUnpinnedPostIndex >= 0);
    assert.ok(omittedPinnedPostIndex >= 0);
    assert.ok(omittedPinnedPostIndex < explicitlyUnpinnedPostIndex);
  } finally {
    fs.rmSync(TEMP_EXPLICITLY_UNPINNED_POST_PATH, { force: true });
    fs.rmSync(TEMP_OMITTED_PINNED_POST_PATH, { force: true });
  }
});

test('getBlogPostBySlug exposes a numeric recentOrder from frontmatter', () => {
  fs.writeFileSync(
    TEMP_RECENT_POST_PATH,
    `---
title: "Recent Post"
description: "Used for a recent updates regression test."
date: "2026-07-14"
tags: ["test"]
category: "Test"
published: true
recentOrder: 2
---

# Recent Post
`,
    'utf-8',
  );

  try {
    const post = getBlogPostBySlug(TEMP_RECENT_POST_SLUG);

    assert.ok(post);
    assert.equal(post.recentOrder, 2);
  } finally {
    fs.rmSync(TEMP_RECENT_POST_PATH, { force: true });
  }
});

test('getBlogPostBySlug rejects a non-numeric recentOrder', () => {
  fs.writeFileSync(
    TEMP_INVALID_RECENT_POST_PATH,
    `---
title: "Invalid Recent Post"
description: "Used for a recent updates regression test."
date: "2026-07-14"
tags: ["test"]
category: "Test"
published: true
recentOrder: "two"
---

# Invalid Recent Post
`,
    'utf-8',
  );

  try {
    assert.equal(getBlogPostBySlug(TEMP_INVALID_RECENT_POST_SLUG), null);
  } finally {
    fs.rmSync(TEMP_INVALID_RECENT_POST_PATH, { force: true });
  }
});

test('getBlogPostBySlug rejects non-finite recentOrder values', () => {
  for (const recentOrder of ['.nan', '.inf']) {
    const slug = `temp-${recentOrder.slice(1)}-recent-post`;
    const filePath = path.join(BLOG_DIR, `${slug}.md`);

    fs.writeFileSync(
      filePath,
      `---
title: "Invalid Recent Post"
description: "Used for a recent updates regression test."
date: "2026-07-14"
tags: ["test"]
category: "Test"
published: true
recentOrder: ${recentOrder}
---

# Invalid Recent Post
`,
      'utf-8',
    );

    try {
      assert.equal(getBlogPostBySlug(slug), null);
    } finally {
      fs.rmSync(filePath, { force: true });
    }
  }
});
