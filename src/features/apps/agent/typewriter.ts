const MAX_ANIMATED_CONTENT_CHARS = 600;
const COMPLETION_CURSOR_DURATION_MS = 720;

// 判断回答长度是否适合播放短时打字动画
export function shouldAnimateTypewriter(contentLength: number): boolean {
  return contentLength > 0 && contentLength <= MAX_ANIMATED_CONTENT_CHARS;
}

// 返回短回复完成后的光标反馈时长
export function getTypewriterAnimationDuration(contentLength: number): number {
  return shouldAnimateTypewriter(contentLength) ? COMPLETION_CURSOR_DURATION_MS : 0;
}
