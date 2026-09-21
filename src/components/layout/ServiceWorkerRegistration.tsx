'use client';

import { useEffect } from 'react';

// 注册生产环境的 Service Worker，离线能力失败时不影响正常访问
async function registerServiceWorker(): Promise<void> {
  const isSecureOrigin = window.isSecureContext || window.location.hostname === 'localhost';

  if (!isSecureOrigin || !('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register('/sw.js?v=3', { scope: '/' });
  } catch {
    // PWA 功能是渐进增强，注册失败不应阻断站点使用。
  }
}

// 开发环境注销旧 Service Worker，避免缓存响应缺少跨源隔离响应头
async function unregisterDevelopmentServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const hadController = Boolean(navigator.serviceWorker.controller);
    const unregisterResults = await Promise.all(registrations.map((registration) => registration.unregister()));

    if (hadController && unregisterResults.some(Boolean)) {
      window.location.reload();
    }
  } catch {
    // 开发环境清理失败时保留页面，避免影响应用调试。
  }
}

// 页面水合后仅在生产构建中启用离线缓存
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      void unregisterDevelopmentServiceWorkers();
      return;
    }

    void registerServiceWorker();
  }, []);

  return null;
}
