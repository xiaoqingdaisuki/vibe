/** RSS 阅读器：客户端页面与交互编排 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import { cn } from '@/lib/utils';
import { getStorageItem, setStorageItem } from '@/lib/storage';
import { FeedErrorState } from './feed-error-state';
import { loadFeedOnce } from './load-feed';
import { createStoredSubscriptions, restoreSubscriptions } from './subscriptions';
import type { RssFeed, RssFeedItem } from './types';
import { STORAGE_KEY } from './types';
import styles from './styles/RSSReader.module.css';

// 将相对链接解析为绝对 URL
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

// 将 HTML 内容简化为纯文本摘要
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

// 从原始 author 字段提取作者名称
function extractAuthor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const match = trimmed.match(/\(([^)]+)\)$/);
  if (match) return match[1];
  if (trimmed.includes('@')) return trimmed.split('@')[0];
  return trimmed || undefined;
}

// 将 RSS 2.0 XML 内容解析为结构化订阅数据
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

  const items: RssFeedItem[] = Array.from(itemNodes).map(
    // 从 RSS 条目提取链接、作者、内容摘要与缩略图
    (node) => {
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
        // 缩略图 URL 同样需经协议白名单校验，拒绝非 http/https 的来源
        if (encType.startsWith('image/') && encUrl) {
          const resolved = resolveLink(feedUrl, encUrl);
          if (resolved !== '#') thumbnail = resolved;
        }
      }
      if (!thumbnail) {
        const mediaContent = node.querySelector('media\\:content, content');
        if (mediaContent) {
          const url = mediaContent.getAttribute('url');
          if (url) {
            const resolved = resolveLink(feedUrl, url);
            if (resolved !== '#') thumbnail = resolved;
          }
        }
      }
      if (!thumbnail) {
        const imgMatch = contentHtml.match(/src="([^"]+)"/);
        if (imgMatch?.[1]) thumbnail = resolveLink(feedUrl, imgMatch[1]);
      }

      return { title, link, pubDate, contentSnippet, author, thumbnail };
    },
  );

  return {
    url: feedUrl,
    title: feedTitle,
    description: feedDesc,
    items,
    fetchedAt: Date.now(),
  };
}

// 将 Atom XML 内容解析为结构化订阅数据
function parseAtomFeed(feedEl: Element, feedUrl: string): RssFeed {
  const feedTitle = feedEl.querySelector('title')?.textContent?.trim() || new URL(feedUrl).hostname;

  const entries = feedEl.querySelectorAll('entry');
  if (entries.length === 0) {
    throw new Error('该Atom订阅源暂无内容');
  }

  const items: RssFeedItem[] = Array.from(entries).map(
    // 从 Atom 条目提取发布日期、链接、摘要与缩略图
    (entry) => {
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
    },
  );

  return {
    url: feedUrl,
    title: feedTitle,
    description: undefined,
    items,
    fetchedAt: Date.now(),
  };
}

// 通过服务端代理获取 RSS 订阅内容
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

// 将日期字符串格式化为简短本地时间
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

// 单条 RSS 文章卡片组件
function FeedItemCard({ item }: { item: RssFeedItem }) {
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.itemCard}>
      {item.thumbnail && (
        <div className={styles.itemThumb}>
          {/* RSS 缩略图来自用户订阅的任意主机，不能安全地使用需预先配置主机白名单的 next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.thumbnail} alt="" width="120" height="80" loading="lazy" />
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

// 单个订阅源区块，支持展开/收起和移除
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

  // 订阅源展开时将标题滚动至可见区域
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

// 添加订阅表单，验证 URL 后添加到订阅列表
function AddFeedForm({ onAdd }: { onAdd: (url: string, feed: RssFeed) => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 校验订阅地址并获取内容，成功后添加订阅并清空输入
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
      const feed = await fetchRSS(trimmed);
      onAdd(trimmed, feed);
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

// RSS 阅读器主组件，管理订阅、加载和展示
export default function RSSReader() {
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [feeds, setFeeds] = useState<Map<string, RssFeed>>(new Map());
  const [loadingFeeds, setLoadingFeeds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [hasUserToggled, setHasUserToggled] = useState(false);
  const [showBackTop, setShowBackTop] = useState(false);

  const feedsRef = useRef(feeds);
  const subsRef = useRef(subscriptions);
  const loadingFeedsRef = useRef<Set<string>>(new Set());

  // 同步订阅列表引用，供异步加载判断订阅是否仍存在
  useEffect(() => {
    subsRef.current = subscriptions;
  }, [subscriptions]);

  // 同步内容缓存引用，避免重复加载已有订阅源
  useEffect(() => {
    feedsRef.current = feeds;
  }, [feeds]);

  // 监听页面滚动以控制回到顶部按钮，并清理监听
  useEffect(() => {
    // 根据滚动距离更新回到顶部按钮的可见性
    const handleScroll = () => {
      setShowBackTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 平滑滚动回页面顶部
  const handleBackTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 标记用户主动操作并切换订阅源展开状态
  const handleToggle = useCallback((url: string) => {
    setHasUserToggled(true);
    setExpandedUrl((prev) => (prev === url ? null : url));
  }, []);

  // 去重加载订阅源，并统一处理加载、成功和失败状态
  const loadFeed = useCallback(async (url: string) => {
    await loadFeedOnce({
      url,
      inFlight: loadingFeedsRef.current,
      fetchFeed: fetchRSS,
      // 标记订阅源正在加载并清除上次错误
      onStart: () => {
        setLoadingFeeds((prev) => new Set(prev).add(url));
        setErrors(
          // 复制错误映射并清除当前订阅源的旧错误
          (prev) => {
            const next = new Map(prev);
            next.delete(url);
            return next;
          },
        );
      },
      // 仅为仍被订阅的地址缓存返回内容
      onSuccess: (feed) => {
        if (!subsRef.current.includes(url)) return;

        setFeeds(
          // 更新内容缓存，并同步供异步流程使用的引用
          (prev) => {
            const next = new Map(prev);
            next.set(url, feed);
            feedsRef.current = next;
            return next;
          },
        );
      },
      // 仅为仍被订阅的地址记录加载错误
      onError: (message) => {
        if (!subsRef.current.includes(url)) return;

        setErrors(
          // 复制错误映射并保存当前订阅源的失败提示
          (prev) => {
            const next = new Map(prev);
            next.set(url, message);
            return next;
          },
        );
      },
      // 请求结束后移除订阅源的加载标记
      onSettled: () => {
        setLoadingFeeds(
          // 复制加载集合并移除已结束的订阅请求
          (prev) => {
            const next = new Set(prev);
            next.delete(url);
            return next;
          },
        );
      },
    });
  }, []);

  // 读取本地订阅并在下一帧恢复列表
  useEffect(() => {
    const saved = getStorageItem<unknown>(STORAGE_KEY, null);
    const frame = requestAnimationFrame(() => setSubscriptions(restoreSubscriptions(saved)));
    return () => cancelAnimationFrame(frame);
  }, []);

  // 为订阅列表中尚未缓存的地址加载内容
  useEffect(() => {
    if (subscriptions.length === 0) return;

    subscriptions.forEach(
      // 跳过已有缓存的订阅，仅加载缺失内容
      (url) => {
        const existing = feedsRef.current.get(url);
        if (existing) return;

        void loadFeed(url);
      },
    );
  }, [loadFeed, subscriptions]);

  // 缓存新订阅内容并持久化去重后的订阅列表
  const addSubscription = useCallback((url: string, feed: RssFeed) => {
    setFeeds(
      // 写入新订阅内容并同步缓存引用
      (prev) => {
        const next = new Map(prev);
        next.set(url, feed);
        feedsRef.current = next;
        return next;
      },
    );
    setErrors(
      // 添加订阅成功后移除相同地址的旧错误
      (prev) => {
        const next = new Map(prev);
        next.delete(url);
        return next;
      },
    );
    setSubscriptions(
      // 去重添加订阅，并同步持久化数据与当前列表引用
      (prev) => {
        if (prev.includes(url)) return prev;
        const next = [...prev, url];
        setStorageItem(STORAGE_KEY, createStoredSubscriptions(next));
        subsRef.current = next;
        return next;
      },
    );
  }, []);

  // 移除订阅并同步清理缓存内容与错误状态
  const removeSubscription = useCallback((url: string) => {
    setSubscriptions(
      // 移除指定订阅，并同步持久化数据与当前列表引用
      (prev) => {
        const next = prev.filter((u) => u !== url);
        setStorageItem(STORAGE_KEY, createStoredSubscriptions(next));
        subsRef.current = next;
        return next;
      },
    );
    setFeeds(
      // 从内容缓存中移除已取消的订阅
      (prev) => {
        const next = new Map(prev);
        next.delete(url);
        return next;
      },
    );
    setErrors(
      // 从错误映射中移除已取消的订阅
      (prev) => {
        const next = new Map(prev);
        next.delete(url);
        return next;
      },
    );
  }, []);

  const expandedFeedUrl = hasUserToggled ? expandedUrl : subscriptions[0];

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
          {subscriptions.map(
            // 按加载、失败或成功状态选择订阅源展示内容
            (url) => {
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
                  <FeedErrorState
                    key={url}
                    hostname={new URL(url).hostname}
                    message={error}
                    onRetry={() => void loadFeed(url)}
                    onRemove={() => removeSubscription(url)}
                  />
                );
              }

              if (feed) {
                return (
                  <FeedSection
                    key={url}
                    feed={feed}
                    onRemove={() => removeSubscription(url)}
                    expanded={expandedFeedUrl === url}
                    onToggle={() => handleToggle(url)}
                  />
                );
              }

              return null;
            },
          )}
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
