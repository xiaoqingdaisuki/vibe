export interface RssFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  contentSnippet?: string;
  author?: string;
  thumbnail?: string;
}

export interface RssFeed {
  url: string;
  title: string;
  description?: string;
  items: RssFeedItem[];
  fetchedAt: number;
}

export const DEFAULT_FEEDS: string[] = [
  'https://v2ex.com/index.xml',
  'https://36kr.com/feed',
  'https://sspai.com/feed',
  'https://feeds.feedburner.com/ruanyifeng',
  'https://plink.anyfeeder.com/zhihu/daily',
];

export const STORAGE_KEY = 'rss-subscriptions';
