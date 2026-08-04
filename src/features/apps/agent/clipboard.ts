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

// 复制文本到剪贴板，优先使用navigator.clipboard，降级到textarea方案
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!globalThis.navigator?.clipboard) return copyWithLegacyTextarea(text);
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyWithLegacyTextarea(text);
  }
}
