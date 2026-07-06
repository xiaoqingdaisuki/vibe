import { createElement } from "react"
import styles from "./BlogContent.module.css"
import { renderBlogMarkdown } from "./render-blog-markdown"

interface BlogContentProps {
  source: string
}

export async function BlogContent({ source }: BlogContentProps) {
  const content = await renderBlogMarkdown(source)

  return createElement(
    "div",
    { className: styles.content },
    content,
  )
}
