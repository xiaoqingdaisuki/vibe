import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Offline',
  description: 'Vibe is currently unavailable because there is no network connection.',
  robots: {
    index: false,
    follow: false,
  },
};

// 离线时展示缓存不可用页面，并保留返回主页入口
export default function OfflinePage() {
  return (
    <div className="page-enter">
      <div className="mx-auto max-w-2xl px-4 py-16 text-center md:px-6 md:py-24">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-wash">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
            aria-hidden="true"
          >
            <path d="M5 12.5a5 5 0 0 1 8.8-3.3A4 4 0 1 1 18 16H6.5" />
            <path d="m4 18 4-4 4 4" />
            <path d="M8 14v7" />
          </svg>
        </div>
        <h1 className="mt-5 text-3xl font-bold font-display text-primary">You&apos;re offline</h1>
        <p className="mt-4 text-base text-secondary">
          Check your connection and try again. Previously visited pages remain available when they have been cached.
        </p>
        <Link href="/" className="button primary mt-8 inline-flex">
          Try the home page
        </Link>
      </div>
    </div>
  );
}
