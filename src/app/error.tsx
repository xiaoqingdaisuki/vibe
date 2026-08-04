'use client';

import { useEffect } from 'react';

// 全局错误边界组件，展示错误信息和重试按钮
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-enter">
      <div className="mx-auto max-w-2xl px-4 py-16 text-center md:px-6 md:py-24">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-5 bg-error">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold font-display text-primary">Something went wrong</h2>
        <p className="mt-4 text-base text-secondary">An unexpected error occurred. Please try again.</p>
        <button onClick={reset} className="button primary mt-8">
          Try again
        </button>
      </div>
    </div>
  );
}
