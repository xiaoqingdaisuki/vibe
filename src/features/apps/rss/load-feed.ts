import type { RssFeed } from './types';

interface LoadFeedOptions {
  url: string;
  inFlight: Set<string>;
  fetchFeed: (url: string) => Promise<RssFeed>;
  onStart: () => void;
  onSuccess: (feed: RssFeed) => void;
  onError: (message: string) => void;
  onSettled: () => void;
}

export async function loadFeedOnce({
  url,
  inFlight,
  fetchFeed,
  onStart,
  onSuccess,
  onError,
  onSettled,
}: LoadFeedOptions): Promise<void> {
  if (inFlight.has(url)) return;

  inFlight.add(url);
  onStart();

  try {
    onSuccess(await fetchFeed(url));
  } catch (error: unknown) {
    onError(error instanceof Error ? error.message : '获取失败');
  } finally {
    inFlight.delete(url);
    onSettled();
  }
}
