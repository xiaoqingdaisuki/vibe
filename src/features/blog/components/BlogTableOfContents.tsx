'use client';

import { useEffect, useState } from 'react';
import type { BlogHeading } from '../lib/headings';
import styles from './BlogTableOfContents.module.css';

interface BlogTableOfContentsProps {
  headings: BlogHeading[];
}

export function BlogTableOfContents({ headings }: BlogTableOfContentsProps) {
  const navigableHeadings = headings.filter((heading) => heading.level === 2 || heading.level === 3);
  const [activeId, setActiveId] = useState(navigableHeadings[0]?.id ?? '');

  useEffect(() => {
    const elements = headings
      .filter((heading) => heading.level === 2 || heading.level === 3)
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length === 0) return;

        const closestHeading = visibleEntries.reduce((closest, entry) =>
          entry.boundingClientRect.top < closest.boundingClientRect.top ? entry : closest,
        );

        setActiveId(closestHeading.target.id);
      },
      { rootMargin: '0px 0px -72% 0px' },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [headings]);

  if (navigableHeadings.length === 0) return null;

  return (
    <aside className={styles.aside} aria-label="文章目录">
      <nav className={styles.navigation} aria-label="文章目录">
        <p className={styles.label}>目录</p>
        <ol className={styles.list}>
          {navigableHeadings.map((heading) => {
            const isActive = heading.id === activeId;
            const itemClassName = heading.level === 3 ? styles.subsection : styles.section;

            return (
              <li key={heading.id} className={itemClassName}>
                <a
                  href={`#${heading.id}`}
                  className={isActive ? styles.activeLink : styles.link}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={() => setActiveId(heading.id)}
                >
                  {heading.text}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
