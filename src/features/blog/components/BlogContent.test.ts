import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { renderBlogMarkdown } from "./render-blog-markdown.ts"

test("renderBlogMarkdown renders markdown as semantic HTML", async () => {
  const markup = renderToStaticMarkup(
    await renderBlogMarkdown(`
# Hello Web Lab

This is **bold** text.

- First
- Second
      `),
  )

  assert.match(markup, /<h1>Hello Web Lab<\/h1>/)
  assert.match(markup, /<strong>bold<\/strong>/)
  assert.match(markup, /<ul>\s*<li>First<\/li>\s*<li>Second<\/li>\s*<\/ul>/)
})
