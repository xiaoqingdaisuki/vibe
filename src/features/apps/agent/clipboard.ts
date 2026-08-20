// 使用旧版textarea方式复制文本，兼容无clipboard API的浏览器
function copyWithLegacyTextarea(text: string): boolean {
  if (typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

// 复制文本到剪贴板，优先在用户手势内使用textarea，再回退到Clipboard API
export async function copyText(text: string): Promise<boolean> {
  if (copyWithLegacyTextarea(text)) return true;

  try {
    if (!globalThis.navigator?.clipboard) return false;
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
