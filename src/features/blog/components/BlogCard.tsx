import Link from 'next/link';
import type { BlogPost } from '../types';
import styles from '../styles/BlogCard.module.css';

interface BlogCardProps {
  post: BlogPost;
}

export function BlogCard({ post }: BlogCardProps) {
  return (
    <article className={`${styles.card} group`}>
      <Link href={`/blog/${post.slug}`} className={styles.link}>
        <h3 className="text-xl font-semibold font-display">{post.title}</h3>
        <p className="mt-2 text-sm text-muted">{post.description}</p>
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-3">
            <time dateTime={post.date}>{post.date}</time>
            {post.tags.length > 0 && (
              <>
                <span className="text-strong">|</span>
                <span className="text-accent">{post.tags[0]}</span>
              </>
            )}
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
          >
            <path d="M7 17L17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </div>
      </Link>
    </article>
  );
}
