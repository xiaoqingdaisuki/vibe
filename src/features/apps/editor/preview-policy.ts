// 生成允许公开 HTTPS 资源、仍保持最小权限的沙箱 CSP
export function createPreviewContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https:`,
    "script-src-attr 'none'",
    "style-src 'unsafe-inline' https:",
    'img-src https: data:',
    'font-src https: data:',
    'media-src https:',
    'connect-src https:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
  ].join('; ');
}
