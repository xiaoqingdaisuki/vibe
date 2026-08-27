'use client';

import { useEffect, useState } from 'react';
import styles from './InstallPwaButton.module.css';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

// 判断事件是否提供浏览器的 PWA 安装提示能力
function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function';
}

// 在支持安装提示的浏览器中显示站点安装按钮
export function InstallPwaButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // 拦截浏览器提示，改由导航栏中的明确操作触发
    function handleBeforeInstallPrompt(event: Event) {
      if (!isBeforeInstallPromptEvent(event)) return;

      event.preventDefault();
      setDeferredPrompt(event);
    }

    // 安装完成后移除不再适用的安装入口
    function handleAppInstalled() {
      setDeferredPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 请求浏览器展示原生安装确认窗口
  async function handleInstall() {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    setDeferredPrompt(null);
  }

  if (!deferredPrompt) return null;

  return (
    <button type="button" className={styles.installButton} onClick={handleInstall} aria-label="Install Vibe">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      <span className={styles.installLabel}>Install</span>
    </button>
  );
}
