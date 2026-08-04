import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { BlogContent } from '@/features/blog/components/BlogContent';
import { BlogTableOfContents } from '@/features/blog/components/BlogTableOfContents';
import { getBlogHeadings } from '@/features/blog/lib/headings';
import { getPublishedBlogPostBySlug, getPublishedBlogSlugs } from '@/features/blog/lib/posts';
import styles from '@/features/blog/styles/BlogPost.module.css';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

// 将ISO日期字符串格式化为英文可读格式
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

export async function generateStaticParams() {
  const slugs = getPublishedBlogSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPublishedBlogPostBySlug(slug);

  if (!post) {
    return { title: 'Post Not Found' };
  }

  return {
    title: post.title,
    description: post.description,
  };
}

// 博客文章详情页，加载文章内容和目录导航
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPublishedBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const headings = getBlogHeadings(post.content);

  return (
    <div className="page-enter">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <div className={styles.layout}>
          <BlogTableOfContents headings={headings} />
          <div className={styles.shell}>
            <Breadcrumb items={[{ label: 'Blog', href: '/blog' }, { label: post.title }]} />
            <article>
              <header className={styles.header}>
                <span className="eyebrow">Post</span>
                <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl font-display">{post.title}</h1>
                <p className="mt-3 text-base md:text-lg text-secondary">{post.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <time dateTime={post.date} className="inline-flex items-center px-2.5 py-1 rounded-full bg-wash">
                    {formatDate(post.date)}
                  </time>
                  {post.updated && post.updated !== post.date && (
                    <>
                      <span className="hidden md:inline text-strong">|</span>
                      <time dateTime={post.updated} className="hidden md:inline">
                        Updated {formatDate(post.updated)}
                      </time>
                    </>
                  )}
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-wash text-accent"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </header>

              <div className="min-w-0">{await BlogContent({ source: post.content, headings })}</div>

              <div className={styles.footer}>
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-accent font-display"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                  Back to Blog
                </Link>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
