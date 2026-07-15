import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadFeedOnce } from './load-feed.ts';
import type { RssFeed } from './types.ts';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return {
        format: 'module',
        source: 'export default new Proxy({}, { get: (_, property) => String(property) });',
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { FeedErrorState } = await import('./feed-error-state.ts');

interface ButtonElementProps {
  children?: ReactNode;
  onClick?: () => void;
}

const url = 'https://example.com/feed.xml';
const feed: RssFeed = {
  url,
  title: 'Example feed',
  items: [],
  fetchedAt: 1,
};

function findButton(node: ReactNode, label: string): ReactElement<ButtonElementProps> | undefined {
  if (!isValidElement<ButtonElementProps>(node)) return undefined;
  if (node.type === 'button' && node.props.children === label) return node;

  for (const child of Children.toArray(node.props.children)) {
    const button = findButton(child, label);
    if (button) return button;
  }

  return undefined;
}

test('the feed error state renders and wires the retry action', () => {
  let retryCount = 0;
  const view = FeedErrorState({
    hostname: 'example.com',
    message: '暂时无法访问',
    onRetry: () => {
      retryCount += 1;
    },
    onRemove: () => undefined,
  });

  const markup = renderToStaticMarkup(view);
  assert.match(markup, />重试<\/button>/);
  assert.match(markup, /example\.com/);
  assert.match(markup, /暂时无法访问/);

  const retryButton = findButton(view, '重试');
  assert.ok(retryButton?.props.onClick);
  retryButton.props.onClick();
  assert.equal(retryCount, 1);
});

test('a failed feed request can be retried', async () => {
  const inFlight = new Set<string>();
  const events: string[] = [];
  let attempts = 0;

  const fetchFeed = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('暂时无法访问');
    return feed;
  };

  const load = () =>
    loadFeedOnce({
      url,
      inFlight,
      fetchFeed,
      onStart: () => events.push('start'),
      onSuccess: (loadedFeed) => events.push(`success:${loadedFeed.title}`),
      onError: (message) => events.push(`error:${message}`),
      onSettled: () => events.push('settled'),
    });

  await load();
  assert.equal(inFlight.has(url), false);

  await load();

  assert.equal(attempts, 2);
  assert.deepEqual(events, ['start', 'error:暂时无法访问', 'settled', 'start', 'success:Example feed', 'settled']);
});
