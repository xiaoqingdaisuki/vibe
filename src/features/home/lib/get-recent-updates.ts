import type { BlogPost } from '../../blog/types.ts';
import type { LabApp } from '../../lab/types.ts';

const RECENT_UPDATE_LIMIT = 3;

type RecentLabApp = LabApp & { recentOrder: number };
type RecentBlogPost = BlogPost & { recentOrder: number };

export type RecentUpdate = { kind: 'lab'; item: RecentLabApp } | { kind: 'blog'; item: RecentBlogPost };

export interface RecentUpdatesOptions {
  apps: LabApp[];
  posts: BlogPost[];
}

export function getRecentUpdates({ apps, posts }: RecentUpdatesOptions): RecentUpdate[] {
  const recentApps = apps
    .filter((app): app is RecentLabApp => typeof app.recentOrder === 'number' && Number.isFinite(app.recentOrder))
    .map((item) => ({ kind: 'lab' as const, item }));
  const recentPosts = posts
    .filter((post): post is RecentBlogPost => typeof post.recentOrder === 'number' && Number.isFinite(post.recentOrder))
    .map((item) => ({ kind: 'blog' as const, item }));

  return [...recentApps, ...recentPosts]
    .sort((firstUpdate, secondUpdate) => firstUpdate.item.recentOrder - secondUpdate.item.recentOrder)
    .slice(0, RECENT_UPDATE_LIMIT);
}
