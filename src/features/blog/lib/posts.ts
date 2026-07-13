import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { BlogPost, BlogPostMetadata } from '../types';

const BLOG_DIR = path.join(process.cwd(), 'src/content/blog');
const BLOG_EXTENSIONS = ['.mdx', '.md'] as const;

function parseBlogMetadata(data: unknown): BlogPostMetadata | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const metadata = data as Record<string, unknown>;
  const tags = metadata.tags;

  if (
    typeof metadata.title !== 'string' ||
    typeof metadata.description !== 'string' ||
    typeof metadata.date !== 'string' ||
    typeof metadata.category !== 'string'
  ) {
    return null;
  }

  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) {
    return null;
  }

  if (metadata.updated !== undefined && typeof metadata.updated !== 'string') {
    return null;
  }

  if (metadata.cover !== undefined && typeof metadata.cover !== 'string') {
    return null;
  }

  if (metadata.published !== undefined && typeof metadata.published !== 'boolean') {
    return null;
  }

  return {
    title: metadata.title,
    description: metadata.description,
    date: metadata.date,
    updated: metadata.updated,
    tags: tags ?? [],
    category: metadata.category,
    published: metadata.published ?? true,
    cover: metadata.cover,
  };
}

function readBlogFile(filePath: string): BlogPost | null {
  const slug = path.basename(filePath, path.extname(filePath));
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);
  const metadata = parseBlogMetadata(data);

  if (!metadata) {
    return null;
  }

  return {
    slug,
    title: metadata.title,
    description: metadata.description,
    date: metadata.date,
    updated: metadata.updated,
    tags: metadata.tags || [],
    category: metadata.category,
    published: metadata.published ?? true,
    cover: metadata.cover,
    content,
  };
}

function resolveBlogPostPath(slug: string): string | null {
  for (const extension of BLOG_EXTENSIONS) {
    const filePath = path.join(BLOG_DIR, `${slug}${extension}`);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

export function getAllBlogSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => BLOG_EXTENSIONS.some((extension) => file.endsWith(extension)))
    .map((file) => file.replace(/\.(mdx|md)$/, ''));
}

export function getBlogPosts(): BlogPost[] {
  return getAllBlogSlugs()
    .map((slug) => getBlogPostBySlug(slug))
    .filter((post): post is BlogPost => post !== null && post.published)
    .sort((left, right) => right.date.localeCompare(left.date));
}

export function getBlogPostBySlug(slug: string): BlogPost | null {
  const filePath = resolveBlogPostPath(slug);

  if (!filePath) {
    return null;
  }

  return readBlogFile(filePath);
}
