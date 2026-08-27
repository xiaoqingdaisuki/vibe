'use client';

import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { shouldShowIosInstallGuide } from '@/lib/pwa-install';
import styles from './InstallPwaButton.module.css';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

// 判断事件是否提供浏览器的 PWA 安装提示能力
function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function';
}

// 判断当前页面是否已经在独立应用窗口中运行
function isStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  );
}

// 订阅 iOS 安装引导状态，当前无需监听额外浏览器事件
function subscribeToIosInstallGuide(): () => void {
  return () => {};
}

// 读取客户端是否应展示 iOS 的手动安装入口
function getIosInstallGuideSnapshot(): boolean {
  return shouldShowIosInstallGuide({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    isStandalone: isStandaloneMode(),
  });
}

// 服务端渲染时保持未显示状态，避免水合不一致
function getServerIosInstallGuideSnapshot(): boolean {
  return false;
}

interface IosInstallDialogProps {
  onClose: () => void;
}

// 展示 iOS 将网页添加到主屏幕的操作步骤
function IosInstallDialog({ onClose }: IosInstallDialogProps) {
  // 打开引导时支持使用 Escape 关闭，但不锁定页面滚动
  useEffect(() => {
    // 处理键盘关闭操作
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // 仅在点击遮罩空白处时关闭引导窗口
  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return createPortal(
    <div className={styles.dialogOverlay} onClick={handleBackdropClick}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ios-install-title"
        aria-describedby="ios-install-description"
      >
        <div className={styles.dialogHeader}>
          <h2 id="ios-install-title" className={styles.dialogTitle}>
            Install Vibe
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close install instructions"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12" />
              <path d="m18 6-12 12" />
            </svg>
          </button>
        </div>
        <p id="ios-install-description" className={styles.dialogDescription}>
          Add Vibe to your Home Screen from your browser&apos;s Share menu.
        </p>
        <ol className={styles.stepList}>
          <li className={styles.stepItem}>
            <span className={styles.stepNumber}>1</span>
            <span>
              Tap <strong>Share</strong>{' '}
              <svg
                className={styles.shareIcon}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="Share"
              >
                <path d="M12 16V3" />
                <path d="m7 8 5-5 5 5" />
                <path d="M5 13v7h14v-7" />
              </svg>{' '}
              in the browser toolbar.
            </span>
          </li>
          <li className={styles.stepItem}>
            <span className={styles.stepNumber}>2</span>
            <span>
              Choose <strong>Add to Home Screen</strong>.
            </span>
          </li>
          <li className={styles.stepItem}>
            <span className={styles.stepNumber}>3</span>
            <span>
              Tap <strong>Add</strong> to finish.
            </span>
          </li>
        </ol>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dismissButton} onClick={onClose}>
            Not now
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

// 在支持安装提示的浏览器中显示站点安装按钮
export function InstallPwaButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const showIosGuide = useSyncExternalStore(
    subscribeToIosInstallGuide,
    getIosInstallGuideSnapshot,
    getServerIosInstallGuideSnapshot,
  );

  // 初始化平台安装能力，并监听支持原生安装的浏览器事件
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
      setIosGuideOpen(false);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 打开 iOS 的手动安装步骤
  function openIosGuide() {
    setIosGuideOpen(true);
  }

  // 关闭 iOS 的手动安装步骤
  function closeIosGuide() {
    setIosGuideOpen(false);
  }

  // 请求浏览器展示原生安装确认窗口
  async function handleInstall() {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
    } finally {
      setDeferredPrompt(null);
    }
  }

  if (!deferredPrompt && !showIosGuide) return null;

  const handleButtonClick = showIosGuide ? openIosGuide : handleInstall;
  const buttonLabel = showIosGuide ? 'How to install Vibe' : 'Install Vibe';

  return (
    <>
      <button
        type="button"
        className={styles.installButton}
        onClick={handleButtonClick}
        aria-label={buttonLabel}
        aria-haspopup={showIosGuide ? 'dialog' : undefined}
      >
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
      {iosGuideOpen ? <IosInstallDialog onClose={closeIosGuide} /> : null}
    </>
  );
}
