import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { getBlogPostBySlug, getBlogPosts } from "./posts.ts"

const BLOG_DIR = path.join(process.cwd(), "src/content/blog")
const TEMP_POST_SLUG = "temp-md-post"
const TEMP_POST_PATH = path.join(BLOG_DIR, `${TEMP_POST_SLUG}.md`)

test("getBlogPostBySlug supports .md posts as well as .mdx", () => {
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
    "utf-8",
  )

  try {
    const post = getBlogPostBySlug(TEMP_POST_SLUG)

    assert.ok(post)
    assert.equal(post.slug, TEMP_POST_SLUG)
    assert.match(post.content, /# Markdown Title/)
  } finally {
    fs.rmSync(TEMP_POST_PATH, { force: true })
  }
})

test("getBlogPostBySlug rejects invalid frontmatter instead of returning malformed data", () => {
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
    "utf-8",
  )

  try {
    const post = getBlogPostBySlug(TEMP_POST_SLUG)
    const posts = getBlogPosts()

    assert.equal(post, null)
    assert.equal(posts.some((entry) => entry.slug === TEMP_POST_SLUG), false)
  } finally {
    fs.rmSync(TEMP_POST_PATH, { force: true })
  }
})
