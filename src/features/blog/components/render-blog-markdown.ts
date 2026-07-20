import { createElement, type ComponentProps, type JSX } from 'react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import type { BlogHeading, BlogHeadingLevel } from '../lib/headings';

function createHeadingComponent(level: BlogHeadingLevel, headings: BlogHeading[], position: { current: number }) {
  return function BlogHeadingComponent({ children, ...props }: ComponentProps<'h2'>) {
    const heading = headings[position.current];
    position.current += 1;
    const tag = `h${level}` as keyof JSX.IntrinsicElements;

    return createElement(tag, { ...props, id: heading?.id ?? props.id }, children);
  };
}

export async function renderBlogMarkdown(source: string, headings: BlogHeading[]) {
  const position = { current: 0 };

  return await MDXRemote({
    source,
    components: {
      h1: createHeadingComponent(1, headings, position),
      h2: createHeadingComponent(2, headings, position),
      h3: createHeadingComponent(3, headings, position),
      h4: createHeadingComponent(4, headings, position),
      h5: createHeadingComponent(5, headings, position),
      h6: createHeadingComponent(6, headings, position),
    },
  });
}
