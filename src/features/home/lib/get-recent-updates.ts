import type { BlogPost } from '../../blog/types.ts';
import type { LabApp } from '../../lab/types.ts';

export type RecentUpdateReference = { kind: 'lab'; slug: string } | { kind: 'blog'; slug: string };

type RecentUpdateReferences = readonly [RecentUpdateReference, RecentUpdateReference, RecentUpdateReference];

export const RECENT_UPDATE_REFERENCES = [
  { kind: 'lab', slug: 'ai' },
  { kind: 'lab', slug: 'rss' },
  { kind: 'blog', slug: 'vibe-log' },
] as const satisfies RecentUpdateReferences;

export type RecentUpdate = { kind: 'lab'; item: LabApp } | { kind: 'blog'; item: BlogPost };

export interface RecentUpdatesOptions {
  apps: LabApp[];
  posts: BlogPost[];
  references?: RecentUpdateReferences;
}

// 根据预设引用组装最近更新列表，优先展示置顶内容
export function getRecentUpdates({
  apps,
  posts,
  references = RECENT_UPDATE_REFERENCES,
}: RecentUpdatesOptions): RecentUpdate[] {
  const appsBySlug = new Map(apps.map((app) => [app.slug, app]));
  const postsBySlug = new Map(posts.map((post) => [post.slug, post]));
  const updates: RecentUpdate[] = [];

  for (const reference of references) {
    if (reference.kind === 'lab') {
      const item = appsBySlug.get(reference.slug);
      if (item) updates.push({ kind: 'lab', item });
      continue;
    }

    const item = postsBySlug.get(reference.slug);
    if (item) updates.push({ kind: 'blog', item });
  }

  return updates;
}
