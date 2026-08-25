import type { Theme } from '@/lib/theme';

import { createExecutableJavaScript } from './javascript-execution.ts';
import { createPreviewContentSecurityPolicy } from './preview-policy.ts';
import { getPreviewSourceMode } from './source-mode.ts';

export interface PreviewDocumentOptions {
  code: string;
  nonce: string;
  sessionId: string;
  theme: Theme;
}

const REACT_RUNTIME = {
  babel: 'https://unpkg.com/@babel/standalone@latest/babel.min.js',
  react: 'https://esm.sh/react@latest',
  reactDom: 'https://esm.sh/react-dom@latest/client?deps=react@latest',
};

const PREVIEW_SCROLLBAR_STYLE = `
  html {
    scrollbar-color: #cccccc transparent;
    scrollbar-width: thin;
  }

  ::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background: #cccccc;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #888888;
  }
`;

const RUNTIME_SOURCE = `
  (() => {
    const payload = window.__VIBE_ONLINE_EDITOR_PAYLOAD__;
    const host = document.getElementById('vibe-preview-root');
    let hasReactRuntime = false;

    const send = (message) => parent.postMessage({ ...message, sessionId: payload.sessionId }, '*');
    const toMessage = (value) => {
      if (value instanceof Error) return value.stack || value.message;
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    const applyTheme = (theme) => {
      document.documentElement.dataset.vibeTheme = theme;
      host.dataset.vibeTheme = theme;
    };
    const enableViewportScroll = () => {
      document.documentElement.style.setProperty('overflow', 'auto', 'important');
    };
    const reportRuntimeError = (error) => send({ type: 'vibe:online-editor:runtime-error', message: toMessage(error) });
    const loadScript = (url) =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.async = true;
        script.nonce = payload.nonce;
        script.src = url;
        script.onload = resolve;
        script.onerror = () => reject(new Error('无法加载运行时依赖：' + url));
        document.head.append(script);
      });
    const ensureReactRuntime = async () => {
      if (hasReactRuntime) return;
      const [reactModule, reactDomModule] = await Promise.all([
        import(payload.reactRuntime.react),
        import(payload.reactRuntime.reactDom),
      ]);
      window.React = reactModule.default || reactModule;
      window.ReactDOM = reactDomModule.default || reactDomModule;
      await loadScript(payload.reactRuntime.babel);
      hasReactRuntime = true;
    };
    const waitForScript = (script) =>
      new Promise((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('无法加载脚本：' + (script.src || '内联脚本')));
        document.body.append(script);
      });
    const isBabelScript = (sourceScript) => {
      const type = (sourceScript.getAttribute('type') || '').toLowerCase();
      const source = sourceScript.textContent || '';
      return type === 'text/babel' || type === 'text/jsx' || /<\\/?[A-Za-z][A-Za-z0-9.-]*(?:\\s|\\/?>)/.test(source);
    };
    const executeHtmlScript = async (sourceScript) => {
      const sourceUrl = sourceScript.getAttribute('src');
      const sourceType = (sourceScript.getAttribute('type') || '').toLowerCase();
      const script = document.createElement('script');
      script.nonce = payload.nonce;
      if (sourceType === 'module') script.type = 'module';
      if (sourceScript.crossOrigin) script.crossOrigin = sourceScript.crossOrigin;
      if (sourceScript.referrerPolicy) script.referrerPolicy = sourceScript.referrerPolicy;

      if (sourceUrl) {
        script.src = sourceUrl;
        await waitForScript(script);
        return;
      }

      const source = sourceScript.textContent || '';
      if (isBabelScript(sourceScript)) {
        await ensureReactRuntime();
        script.textContent = window.Babel.transform(source, {
          filename: 'inline-script.jsx',
          presets: [['react', { runtime: 'classic' }]],
          sourceType: sourceType === 'module' ? 'module' : 'script',
        }).code;
      } else {
        script.textContent = source;
      }

      if (sourceType === 'module') {
        await waitForScript(script);
        return;
      }

      document.body.append(script);
    };
    const runHtml = async () => {
      const sourceDocument = new DOMParser().parseFromString(payload.code, 'text/html');
      const sourceScripts = Array.from(sourceDocument.querySelectorAll('script'));
      const headResources = Array.from(sourceDocument.head.querySelectorAll('link[rel="stylesheet"], style'));
      sourceScripts.forEach((sourceScript) => sourceScript.remove());
      headResources.forEach((resource) => {
        resource.remove();
        const clone = resource.cloneNode(true);
        if (clone instanceof HTMLStyleElement) clone.nonce = payload.nonce;
        document.head.append(clone);
      });
      host.innerHTML = sourceDocument.body.innerHTML;
      for (const sourceScript of sourceScripts) await executeHtmlScript(sourceScript);
    };
    const runJsx = async () => {
      host.innerHTML = '<div id="root"></div>';
      await ensureReactRuntime();
      const transformed = window.Babel.transform(payload.code, {
        filename: 'editor.jsx',
        presets: [['react', { runtime: 'classic' }]],
        sourceType: 'script',
      }).code;
      const script = document.createElement('script');
      script.nonce = payload.nonce;
      script.textContent = transformed;
      document.body.append(script);
    };
    const sendJavaScriptResult = (value) => {
      if (value && typeof value.then === 'function') {
        value.then(sendJavaScriptResult).catch(reportRuntimeError);
        return;
      }
      const message = value === undefined ? '已执行（未返回值）' : toMessage(value);
      send({ type: 'vibe:online-editor:result', message });
    };
    const runJavaScript = () => {
      host.innerHTML = '';
      window.__VIBE_EDITOR_EXECUTION_RESULT__ = undefined;
      const script = document.createElement('script');
      script.nonce = payload.nonce;
      script.textContent = payload.javascriptCode;
      document.body.append(script);
      sendJavaScriptResult(window.__VIBE_EDITOR_EXECUTION_RESULT__);
    };

    ['log', 'info', 'warn', 'error'].forEach((level) => {
      const original = console[level];
      console[level] = (...args) => {
        original.apply(console, args);
        send({ type: 'vibe:online-editor:console', level, message: args.map(toMessage).join(' ') });
      };
    });

    window.addEventListener('error', (event) => reportRuntimeError(event.error || event.message));
    window.addEventListener('unhandledrejection', (event) => reportRuntimeError(event.reason));
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.sessionId !== payload.sessionId || message.type !== 'vibe:online-editor:theme') return;
      applyTheme(message.theme);
    });

    const start = async () => {
      try {
        applyTheme(payload.theme);
        enableViewportScroll();
        if (payload.mode === 'html') {
          await runHtml();
        } else if (payload.mode === 'jsx') {
          await runJsx();
        } else {
          runJavaScript();
        }
        send({ type: 'vibe:online-editor:ready' });
      } catch (error) {
        reportRuntimeError(error);
      }
    };

    start();
  })();
`;

// 序列化不可信源码，防止它提前结束内联运行时脚本
function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// 转义 nonce 属性以维持生成文档的 HTML 结构
function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

// 创建自动识别 React JSX 或原生 HTML 的独立预览文档
export function createPreviewDocument({ code, nonce, sessionId, theme }: PreviewDocumentOptions): string {
  const policy = createPreviewContentSecurityPolicy(nonce);
  const mode = getPreviewSourceMode(code);
  const payload = serializeForScript({
    code,
    javascriptCode: mode === 'javascript' ? createExecutableJavaScript(code) : undefined,
    mode,
    nonce,
    reactRuntime: REACT_RUNTIME,
    sessionId,
    theme,
  });
  const escapedNonce = escapeHtmlAttribute(nonce);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${policy}" />
    <style nonce="${escapedNonce}">${PREVIEW_SCROLLBAR_STYLE}</style>
  </head>
  <body>
    <div id="vibe-preview-root"></div>
    <script nonce="${escapedNonce}">window.__VIBE_ONLINE_EDITOR_PAYLOAD__ = ${payload};</script>
    <script nonce="${escapedNonce}">${RUNTIME_SOURCE}</script>
  </body>
</html>`;
}
