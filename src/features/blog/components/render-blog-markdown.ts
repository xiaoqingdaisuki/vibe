import { MDXRemote } from 'next-mdx-remote/rsc';

export async function renderBlogMarkdown(source: string) {
  return await MDXRemote({ source });
}
