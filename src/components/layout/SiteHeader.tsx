/** 站点导航组件 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { InstallPwaButton } from './InstallPwaButton';
import { ThemeToggle } from './ThemeToggle';
import styles from './SiteHeader.module.css';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/lab', label: 'Lab' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
];

// 站点顶部导航栏
export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // 移动菜单打开时锁定页面滚动，关闭或卸载时恢复
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // 订阅键盘事件以支持 Escape 关闭移动菜单
  useEffect(() => {
    // 按下 Escape 时关闭已展开的移动菜单
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mobileOpen]);

  // 关闭移动导航菜单并保持回调引用稳定
  const closeMenu = useCallback(() => setMobileOpen(false), []);

  return (
    <header className={`sticky top-0 z-50 border-bottom-base ${styles.header}`}>
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex h-14 items-center justify-between">
          {/* 带强调圆点的站点标志 */}
          <Link
            href="/"
            className="text-lg font-bold tracking-tight flex items-center gap-1 font-display text-primary"
            onClick={closeMenu}
          >
            Vibe
          </Link>

          <div className="flex items-center gap-1">
            {/* 桌面导航 */}
            <nav className="hidden md:flex items-center gap-0.5">
              {NAV_LINKS.map(
                // 根据当前路径渲染桌面导航链接的选中状态
                (link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link key={link.href} href={link.href} className={`nav-link ${isActive ? 'nav-link--active' : ''}`}>
                      {link.label}
                    </Link>
                  );
                },
              )}
            </nav>

            <InstallPwaButton />
            <ThemeToggle />

            {/* 移动端菜单按钮 */}
            <button
              className="md:hidden flex items-center justify-center w-11 h-11 -mr-2 rounded-md text-primary"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                {mobileOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="4" y1="7" x2="20" y2="7" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="17" x2="20" y2="17" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 移动端浮层菜单 */}
      {mobileOpen && (
        <div className="md:hidden">
          <div
            className={`fixed inset-0 z-40 backdrop-blur-sm ${styles.mobileOverlay}`}
            onClick={closeMenu}
            aria-hidden="true"
          />
          <nav
            className={`fixed inset-x-0 top-14 z-50 px-4 pb-4 pt-3 border-bottom-base ${styles.mobileMenu}`}
            aria-label="Mobile navigation"
          >
            {NAV_LINKS.map(
              // 渲染移动导航链接并在点击后关闭菜单
              (link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className={`nav-link-mobile ${isActive ? 'nav-link-mobile--active' : ''}`}
                  >
                    {link.label}
                  </Link>
                );
              },
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
