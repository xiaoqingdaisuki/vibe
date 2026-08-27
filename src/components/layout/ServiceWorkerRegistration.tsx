'use client';

import { useEffect } from 'react';

// 注册生产环境的 Service Worker，离线能力失败时不影响正常访问
async function registerServiceWorker(): Promise<void> {
  const isSecureOrigin = window.isSecureContext || window.location.hostname === 'localhost';

  if (!isSecureOrigin || !('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    // PWA 功能是渐进增强，注册失败不应阻断站点使用。
  }
}

// 页面水合后仅在生产构建中启用离线缓存
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    void registerServiceWorker();
  }, []);

  return null;
}
