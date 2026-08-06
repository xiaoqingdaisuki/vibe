const MAX_ANIMATED_CONTENT_CHARS = 600;
const TARGET_ANIMATION_FRAMES = 45;

// 判断回答长度是否适合播放短时打字动画
export function shouldAnimateTypewriter(contentLength: number): boolean {
  return contentLength > 0 && contentLength <= MAX_ANIMATED_CONTENT_CHARS;
}

// 计算每帧展示字符数，将总动画时长限制在固定帧数内
export function getTypewriterFrameSize(contentLength: number): number {
  return Math.max(1, Math.ceil(contentLength / TARGET_ANIMATION_FRAMES));
}
