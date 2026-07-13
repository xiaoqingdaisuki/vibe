import Link from 'next/link';
import { LabCard } from '@/features/lab/components/LabCard';
import { getRecentLabApps } from '@/features/lab/lib/get-recent-lab-apps';
import styles from './styles/Home.module.css';

export const metadata = {
  title: 'Home',
  description: 'Vibe - A personal Web Lab for apps, experiments and demos.',
};

export default function HomePage() {
  const recentApps = getRecentLabApps();

  return (
    <div className={styles.hero}>
      {/* Large title with accent dot */}
      <div className={styles.titleWrap}>
        <h1 className={styles.title}>Vibe</h1>
      </div>

      {/* Tagline */}
      <p className={styles.tagline}>Personal Web Lab</p>

      {/* Category tags */}
      <div className={styles.categories}>
        <span className={`${styles.catTag} ${styles['catTag--accent']}`}>Apps</span>
        <span className={styles.catTag}>Blog</span>
        <span className={styles.catTag}>Experiments</span>
        <span className={styles.catTag}>Tools</span>
        <span className={styles.catTag}>Games</span>
        <span className={styles.catTag}>AI</span>
      </div>

      {/* Divider */}
      <div className={styles.divider} />

      {/* Original content */}
      <section className={`${styles.description} space-y-5 text-base leading-relaxed text-secondary`}>
        <p>
          Vibe is a personal Web Lab — not just a blog, but a container for various web applications, tools, games,
          experiments, and interactive demos.
        </p>
      </section>

      <div className={styles.actions}>
        <Link href="/lab" className={styles.exploreButton}>
          <span>Explore Lab</span>
          <svg
            className={styles.exploreArrow}
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </Link>
      </div>

      {recentApps.length > 0 && (
        <section className={styles.recent} aria-labelledby="recent-updates-title">
          <div className={styles.recentHeading}>
            <span className="eyebrow">Latest</span>
            <h2 id="recent-updates-title" className={styles.recentTitle}>
              Recent updates
            </h2>
          </div>
          <div className={styles.recentGrid}>
            {recentApps.map((app) => (
              <LabCard key={app.slug} app={app} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
