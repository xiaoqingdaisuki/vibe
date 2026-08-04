import { createElement } from 'react';

import styles from './styles/RSSReader.module.css';

interface FeedErrorStateProps {
  hostname: string;
  message: string;
  onRetry: () => void;
  onRemove: () => void;
}

// 订阅源加载失败的错误提示组件，支持重试和移除
export function FeedErrorState({ hostname, message, onRetry, onRemove }: FeedErrorStateProps) {
  return createElement(
    'div',
    { className: styles.feedError },
    createElement(
      'div',
      { className: styles.feedErrorHeader },
      createElement('span', null, hostname),
      createElement(
        'div',
        { className: styles.feedErrorActions },
        createElement(
          'button',
          { type: 'button', className: `${styles.feedErrorButton} ${styles.retryButton}`, onClick: onRetry },
          '重试',
        ),
        createElement(
          'button',
          { type: 'button', className: `${styles.feedErrorButton} ${styles.removeErrorButton}`, onClick: onRemove },
          '移除',
        ),
      ),
    ),
    createElement('p', { className: styles.feedErrorMsg }, message),
  );
}
