import { EmptyState } from '@/components/shared/EmptyState';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { BlogCard } from '@/features/blog/components/BlogCard';
import { getBlogPosts } from '@/features/blog/lib/posts';

export const metadata = {
  title: 'Blog',
  description: 'Thoughts, notes and experiments.',
};

// 博客列表页面，展示所有已发布文章
export default async function BlogPage() {
  const posts = getBlogPosts();

  return (
    <div className="page-enter">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <span className="eyebrow">Essay</span>
        <SectionTitle title="Blog" subtitle="Thoughts, notes and experiments." />

        {posts.length === 0 ? (
          <div className="mt-6 md:mt-8">
            <EmptyState
              title="No posts yet"
              description="Add an .md or .mdx file under src/content/blog/ to publish the first post."
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:mt-8 md:gap-5">
            {posts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
