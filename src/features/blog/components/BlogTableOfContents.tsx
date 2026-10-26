/** 博客：文章目录与阅读位置跟踪组件 */

'use client';

import { useEffect, useState } from 'react';
import type { BlogHeading } from '../lib/headings';
import styles from './BlogTableOfContents.module.css';

interface BlogTableOfContentsProps {
  headings: BlogHeading[];
}

// 展示文章目录，跟踪当前滚动位置高亮对应标题
export function BlogTableOfContents({ headings }: BlogTableOfContentsProps) {
  const navigableHeadings = headings.filter((heading) => heading.level === 2 || heading.level === 3);
  const [activeId, setActiveId] = useState(navigableHeadings[0]?.id ?? '');

  // 观察文章标题进入视口的位置，同步当前目录高亮并清理观察器
  useEffect(() => {
    const elements = headings
      .filter((heading) => heading.level === 2 || heading.level === 3)
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      // 从可见标题中选择最靠近视口顶部的一项并高亮目录
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
          {navigableHeadings.map(
            // 根据标题级别与阅读位置渲染目录层级和当前项
            (heading) => {
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
            },
          )}
        </ol>
      </nav>
    </aside>
  );
}
