import { createElement } from 'react';
import type { BlogHeading } from '../lib/headings';
import styles from './BlogContent.module.css';
import { renderBlogMarkdown } from './render-blog-markdown';

interface BlogContentProps {
  source: string;
  headings: BlogHeading[];
}

export async function BlogContent({ source, headings }: BlogContentProps) {
  const content = await renderBlogMarkdown(source, headings);

  return createElement('div', { className: styles.content }, content);
}
