export const TEXT_RENDER_INTERVAL_MS = 30;
export const MARKDOWN_RENDER_INTERVAL_MS = 100;

export interface LatestValueBatch<T> {
  push(value: T): void;
  flush(): void;
  cancel(): void;
}

// 合并窗口内的最新快照，不按分片排队，完成或停止时可立即收敛
export function createLatestValueBatch<T>(intervalMs: number, publish: (value: T) => void): LatestValueBatch<T> {
  let pending: { value: T } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastPublishedAt: number | undefined;

  // 清理计时器和待展示内容，避免卸载后继续更新
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
    lastPublishedAt = undefined;
  };

  // 一次发布窗口内的全部新增内容，避免逐字追赶造成积压
  const flush = () => {
    const latest = pending;
    cancel();
    if (latest) {
      lastPublishedAt = Date.now();
      publish(latest.value);
    }
  };

  // 保留最新快照且不重置窗口，持续输入时仍定期发布
  const push = (value: T) => {
    pending = { value };
    if (timer === undefined) {
      const delay =
        lastPublishedAt === undefined ? intervalMs : Math.max(0, intervalMs - (Date.now() - lastPublishedAt));
      timer = setTimeout(flush, delay);
    }
  };

  return { push, flush, cancel };
}
