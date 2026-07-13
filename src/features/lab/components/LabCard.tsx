import Link from 'next/link';
import type { LabApp } from '../types';
import styles from '../styles/LabCard.module.css';

interface LabCardProps {
  app: LabApp;
}

export function LabCard({ app }: LabCardProps) {
  return (
    <Link href={app.href} className={styles.card}>
      <h3 className="text-xl font-semibold font-display">{app.title}</h3>
      <p className="mt-3 text-base text-muted">{app.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {app.tags.map((tag) => (
          <span key={tag} className="rounded-full px-3 py-1 text-sm font-medium bg-wash text-accent font-display">
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
