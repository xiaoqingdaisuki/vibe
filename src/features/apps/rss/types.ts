export interface RssFeedItem {
  title: string
  link: string
  pubDate?: string
  contentSnippet?: string
  author?: string
  thumbnail?: string
}

export interface RssFeed {
  url: string
  title: string
  description?: string
  items: RssFeedItem[]
  fetchedAt: number
}

export const DEFAULT_FEEDS: string[] = [
  "https://v2ex.com/index.xml",
  "https://feeds.feedburner.com/ruanyifeng",
  "https://36kr.com/feed",
  "https://sspai.com/feed",
  "https://openai.com/news/rss.xml",
  "https://api.xgo.ing/rss/user/01f60d63a61b44d692cc35c7feb0b4a4",
  "https://plink.anyfeeder.com/zhihu/daily",
]

export const STORAGE_KEY = "rss-subscriptions"
