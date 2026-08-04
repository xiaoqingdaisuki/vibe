import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';

export const metadata = {
  title: '404 - Page Not Found',
};

// 404错误页面，展示错误信息和返回首页链接
export default function NotFoundPage() {
  return (
    <div className="page-enter">
      <div className="mx-auto max-w-2xl px-4 py-16 text-center md:px-6 md:py-24">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-5 bg-wash">
          <span className="text-2xl font-extrabold font-display text-accent">404</span>
        </div>
        <PageHeader
          title="Page not found"
          description="The page you are looking for does not exist or has been moved."
        />

        <Link href="/" className="button primary inline-flex items-center gap-1.5 mt-8">
          Go back home
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
