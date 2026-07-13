'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import { cn } from '@/lib/utils';
import { getStorageItem, setStorageItem } from '@/lib/storage';
import type { RssFeed, RssFeedItem } from './types';
import { STORAGE_KEY, DEFAULT_FEEDS } from './types';
import styles from './styles/RSSReader.module.css';

function resolveLink(baseUrl: string, linkText: string): string {
  const trimmed = linkText.trim();
  if (!trimmed || trimmed === '#') return '#';
  try {
    const url = new URL(trimmed, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#';
  } catch {
    return trimmed;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractAuthor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const match = trimmed.match(/\(([^)]+)\)$/);
  if (match) return match[1];
  if (trimmed.includes('@')) return trimmed.split('@')[0];
  return trimmed || undefined;
}

function parseRSSXml(xmlText: string, feedUrl: string): RssFeed {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    const errText = parseError.textContent?.trim();
    throw new Error(`XML解析失败: ${errText || '格式错误'}`);
  }

  const feedEl = doc.querySelector('feed');
  if (feedEl) {
    return parseAtomFeed(feedEl, feedUrl);
  }

  const channel = doc.querySelector('channel');
  if (!channel) {
    const rssEl = doc.querySelector('rss');
    if (!rssEl) throw new Error('未找到有效的RSS或Atom内容');
    throw new Error('未找到 channel 元素');
  }

  const feedTitle = channel.querySelector('title')?.textContent?.trim() || new URL(feedUrl).hostname;
  const feedDesc = channel.querySelector('description')?.textContent?.trim() || undefined;

  const itemNodes = channel.querySelectorAll('item');
  if (itemNodes.length === 0) {
    throw new Error('该订阅源暂无内容');
  }

  const items: RssFeedItem[] = Array.from(itemNodes).map((node) => {
    const title = node.querySelector('title')?.textContent?.trim() || '无标题';

    let link = node.querySelector('link')?.textContent?.trim() || '';
    if (!link) {
      const enclosure = node.querySelector('enclosure');
      link = enclosure?.getAttribute('url') || '#';
    }
    link = resolveLink(feedUrl, link);

    const pubDate = node.querySelector('pubDate')?.textContent?.trim() || undefined;

    const authorRaw =
      node.querySelector('author')?.textContent?.trim() ||
      node.querySelector('dc\\:creator')?.textContent?.trim() ||
      undefined;
    const author = extractAuthor(authorRaw);

    const contentEl = node.querySelector('content\\:encoded, encoded');
    let contentHtml = contentEl?.textContent?.trim() || '';

    if (!contentHtml) {
      const descEl = node.querySelector('description');
      contentHtml = descEl?.textContent?.trim() || '';
    }

    const contentSnippet = contentHtml ? stripHtml(contentHtml).slice(0, 200) : undefined;

    let thumbnail: string | undefined;
    const enclosure = node.querySelector('enclosure');
    if (enclosure) {
      const encType = enclosure.getAttribute('type') || '';
      const encUrl = enclosure.getAttribute('url') || '';
      if (encType.startsWith('image/') && encUrl) thumbnail = encUrl;
    }
    if (!thumbnail) {
      const mediaContent = node.querySelector('media\\:content, content');
      if (mediaContent) {
        const url = mediaContent.getAttribute('url');
        if (url) thumbnail = url;
      }
    }
    if (!thumbnail) {
      const imgMatch = contentHtml.match(/src="([^"]+)"/);
      if (imgMatch?.[1]) thumbnail = resolveLink(feedUrl, imgMatch[1]);
    }

    return { title, link, pubDate, contentSnippet, author, thumbnail };
  });

  return {
    url: feedUrl,
    title: feedTitle,
    description: feedDesc,
    items,
    fetchedAt: Date.now(),
  };
}

function parseAtomFeed(feedEl: Element, feedUrl: string): RssFeed {
  const feedTitle = feedEl.querySelector('title')?.textContent?.trim() || new URL(feedUrl).hostname;

  const entries = feedEl.querySelectorAll('entry');
  if (entries.length === 0) {
    throw new Error('该Atom订阅源暂无内容');
  }

  const items: RssFeedItem[] = Array.from(entries).map((entry) => {
    const title = entry.querySelector('title')?.textContent?.trim() || '无标题';

    const linkEl = entry.querySelector('link[href]');
    const link = linkEl ? resolveLink(feedUrl, linkEl.getAttribute('href') || '') : '#';

    const pubDate =
      entry.querySelector('published')?.textContent?.trim() ||
      entry.querySelector('updated')?.textContent?.trim() ||
      undefined;

    const author = entry.querySelector('author > name')?.textContent?.trim() || undefined;

    const contentEl = entry.querySelector('content');
    const summaryEl = entry.querySelector('summary');
    const contentHtml = contentEl?.textContent?.trim() || summaryEl?.textContent?.trim() || '';
    const contentSnippet = contentHtml ? stripHtml(contentHtml).slice(0, 200) : undefined;

    let thumbnail: string | undefined;
    const contentWithHtml = contentEl?.innerHTML || summaryEl?.innerHTML || '';
    const imgMatch = contentWithHtml.match(/src="([^"]+)"/);
    if (imgMatch?.[1]) thumbnail = resolveLink(feedUrl, imgMatch[1]);

    return { title, link, pubDate, contentSnippet, author, thumbnail };
  });

  return {
    url: feedUrl,
    title: feedTitle,
    description: undefined,
    items,
    fetchedAt: Date.now(),
  };
}

async function fetchRSS(url: string): Promise<RssFeed> {
  const targetUrl = url.trim();
  if (!targetUrl) throw new Error('请输入有效的RSS地址');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`/api/rss?url=${encodeURIComponent(targetUrl)}`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || `请求失败 (${res.status})`);
    }

    const text = await res.text();
    if (!text.trim()) throw new Error('返回内容为空');
    return parseRSSXml(text, targetUrl);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    const message = err instanceof Error ? err.message : '获取RSS失败';
    throw new Error(message);
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function FeedItemCard({ item }: { item: RssFeedItem }) {
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.itemCard}>
      {item.thumbnail && (
        <div className={styles.itemThumb}>
          <img src={item.thumbnail} alt="" loading="lazy" />
        </div>
      )}
      <div className={styles.itemBody}>
        <h3 className={styles.itemTitle}>{item.title}</h3>
        {item.contentSnippet && <p className={styles.itemSnippet}>{item.contentSnippet}</p>}
        <div className={styles.itemMeta}>
          {item.author && <span className={styles.itemAuthor}>{item.author}</span>}
          {item.pubDate && <span className={styles.itemDate}>{formatDate(item.pubDate)}</span>}
        </div>
      </div>
      <svg
        className={styles.itemArrow}
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
        <path d="M7 17l9.2-9.2M17 17V7H7" />
      </svg>
    </a>
  );
}

function FeedSection({
  feed,
  onRemove,
  expanded,
  onToggle,
}: {
  feed: RssFeed;
  onRemove: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const headerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (expanded && headerRef.current) {
      headerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [expanded]);

  return (
    <div className={styles.feedSection}>
      <div className={styles.feedHeader}>
        <button ref={headerRef} onClick={onToggle} className={styles.feedToggle} aria-expanded={expanded}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(styles.caret, expanded && styles.caretOpen)}
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <div className={styles.feedInfo}>
            <h2 className={styles.feedTitle}>{feed.title}</h2>
            <p className={styles.feedMeta}>
              {feed.items.length} 条 · {new URL(feed.url).hostname}
            </p>
          </div>
        </button>
        <button onClick={onRemove} className={styles.removeBtn} title="取消订阅" aria-label={`取消订阅 ${feed.title}`}>
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className={styles.feedItems}>
          {feed.items.length === 0 ? (
            <p className="text-muted text-sm py-4">暂无内容</p>
          ) : (
            feed.items.map((item, i) => <FeedItemCard key={`${feed.url}-${i}`} item={item} />)
          )}
        </div>
      )}
    </div>
  );
}

function AddFeedForm({ onAdd }: { onAdd: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const trimmed = url.trim();
      if (!trimmed) {
        setError('请输入RSS地址');
        return;
      }
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported');
      } catch {
        setError('请输入有效的URL');
        return;
      }
      await fetchRSS(trimmed);
      onAdd(trimmed);
      setUrl('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取RSS失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.addForm}>
      <div className={styles.addRow}>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          placeholder="输入RSS订阅地址…"
          className={styles.addInput}
          autoComplete="off"
        />
        <Button type="submit" variant="primary" size="sm" disabled={loading} className={styles.addBtn}>
          {loading ? '验证中…' : '添加订阅'}
        </Button>
      </div>
      {error && <p className={styles.formError}>{error}</p>}
    </form>
  );
}

export default function RSSReader() {
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [feeds, setFeeds] = useState<Map<string, RssFeed>>(new Map());
  const [loadingFeeds, setLoadingFeeds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const userToggledRef = useRef(false);
  const [showBackTop, setShowBackTop] = useState(false);

  const feedsRef = useRef(feeds);
  const subsRef = useRef(subscriptions);

  useEffect(() => {
    subsRef.current = subscriptions;
  }, [subscriptions]);

  useEffect(() => {
    feedsRef.current = feeds;
  }, [feeds]);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleBackTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggle = useCallback((url: string) => {
    userToggledRef.current = true;
    setExpandedUrl((prev) => (prev === url ? null : url));
  }, []);

  // Load saved subscriptions and auto-subscribe defaults
  useEffect(() => {
    const saved = getStorageItem<string[]>(STORAGE_KEY, []);
    const validSaved = saved.filter((url): url is string => {
      try {
        const parsed = new URL(url);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !DEFAULT_FEEDS.includes(url);
      } catch {
        return false;
      }
    });
    const frame = requestAnimationFrame(() => setSubscriptions([...DEFAULT_FEEDS, ...validSaved]));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Fetch feeds whenever subscriptions change
  useEffect(() => {
    if (subscriptions.length === 0) return;

    subscriptions.forEach((url) => {
      const existing = feedsRef.current.get(url);
      if (existing) return;

      setLoadingFeeds((prev) => new Set(prev).add(url));

      fetchRSS(url)
        .then((feed) => {
          setFeeds((prev) => {
            const next = new Map(prev);
            next.set(url, feed);
            return next;
          });
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : '获取失败';
          setErrors((prev) => {
            const next = new Map(prev);
            next.set(url, message);
            return next;
          });
        })
        .finally(() => {
          setLoadingFeeds((prev) => {
            const next = new Set(prev);
            next.delete(url);
            return next;
          });
        });
    });
  }, [subscriptions]);

  const addSubscription = useCallback((url: string) => {
    setSubscriptions((prev) => {
      if (prev.includes(url)) return prev;
      const isDefault = DEFAULT_FEEDS.includes(url);
      const next = isDefault
        ? [...DEFAULT_FEEDS, ...prev.filter((u) => !DEFAULT_FEEDS.includes(u)), url]
        : [...prev, url];
      setStorageItem(STORAGE_KEY, next);
      subsRef.current = next;
      return next;
    });
  }, []);

  const removeSubscription = useCallback((url: string) => {
    setSubscriptions((prev) => {
      const next = prev.filter((u) => u !== url);
      setStorageItem(STORAGE_KEY, next);
      subsRef.current = next;
      return next;
    });
    setFeeds((prev) => {
      const next = new Map(prev);
      next.delete(url);
      return next;
    });
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(url);
      return next;
    });
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>RSS Reader</h1>
        <p className={styles.subtitle}>聚合你的RSS订阅</p>
      </header>

      <section className={styles.section}>
        <div className={styles.addSection}>
          <h2 className={styles.sectionTitle}>管理订阅</h2>
          <AddFeedForm onAdd={addSubscription} />
        </div>
      </section>

      {subscriptions.length > 0 && (
        <section className={styles.feedsSection}>
          {subscriptions.map((url) => {
            const feed = feeds.get(url);
            const isLoading = loadingFeeds.has(url);
            const error = errors.get(url);

            if (isLoading) {
              return (
                <div key={url} className={styles.feedLoading}>
                  <span className="text-muted">正在加载 {new URL(url).hostname}…</span>
                </div>
              );
            }

            if (error && !feed) {
              return (
                <div key={url} className={styles.feedError}>
                  <div className={styles.feedErrorHeader}>
                    <span>{new URL(url).hostname}</span>
                    <button onClick={() => removeSubscription(url)} className={styles.removeBtn}>
                      移除
                    </button>
                  </div>
                  <p className={styles.feedErrorMsg}>{error}</p>
                </div>
              );
            }

            if (feed) {
              return (
                <FeedSection
                  key={url}
                  feed={feed}
                  onRemove={() => removeSubscription(url)}
                  expanded={userToggledRef.current ? expandedUrl === url : url === subscriptions[0]}
                  onToggle={() => handleToggle(url)}
                />
              );
            }

            return null;
          })}
        </section>
      )}

      {subscriptions.length === 0 && (
        <div className={styles.empty}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.emptyIcon}
            aria-hidden="true"
          >
            <path d="M4 11a9 9 0 0 1 9 9" />
            <path d="M4 4a16 16 0 0 1 16 16" />
            <circle cx="5" cy="19" r="1" />
          </svg>
          <p className={styles.emptyText}>还没有订阅任何RSS源</p>
          <p className={styles.emptyHint}>在上方输入RSS地址，或点击「一键订阅」添加推荐源</p>
        </div>
      )}

      {showBackTop && (
        <button onClick={handleBackTop} className={styles.backTopBtn} aria-label="回到顶部">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
    </div>
  );
}
