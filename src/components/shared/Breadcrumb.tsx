import Link from 'next/link';
import styles from './Breadcrumb.module.css';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

// 面包屑导航组件
export function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length <= 1) return null;

  return (
    <nav className={styles.wrapper} aria-label="Breadcrumb">
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={index} className={styles.item}>
              {isLast ? (
                <span className={styles.current} aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href ?? '#'} className={styles.link}>
                  {item.label}
                </Link>
              )}

              {!isLast && (
                <span className={styles.separator} aria-hidden="true">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
