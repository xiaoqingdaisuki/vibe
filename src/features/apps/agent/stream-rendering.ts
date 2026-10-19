export const TEXT_RENDER_INTERVAL_MS = 30;
export const TEXT_RENDER_MAX_CHARS_PER_TICK = 50;
export const MARKDOWN_RENDER_INTERVAL_MS = 100;

export interface LatestValueBatch<T> {
  push(value: T): void;
  flush(): void;
  cancel(): void;
}

export interface StreamingTextPresenter {
  append(chunk: string): void;
  push(value: string): void;
  drain(): Promise<void>;
  current(): string;
  cancel(): void;
}

export interface TextFrameScheduler {
  now(): number;
  request(callback: () => void): () => void;
}

interface StreamingTextOptions {
  intervalMs: number;
  maxCharsPerTick: number;
  publish: (value: string) => void;
  scheduler?: TextFrameScheduler;
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

// 优先跟随浏览器绘制调度，非浏览器测试环境使用定时器回退
function createTextFrameScheduler(intervalMs: number): TextFrameScheduler {
  return {
    now: () => performance.now(),
    // 返回当前帧的取消函数，保证停止和卸载时没有残留回调
    request(callback) {
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(callback);
        return () => cancelAnimationFrame(id);
      }
      const id = setTimeout(callback, intervalMs);
      return () => clearTimeout(id);
    },
  };
}

// 按实际经过时间推进游标，每帧只扫描新增字符并限制最大推进量
export function createStreamingTextPresenter({
  intervalMs,
  maxCharsPerTick,
  publish,
  scheduler = createTextFrameScheduler(intervalMs),
}: StreamingTextOptions): StreamingTextPresenter {
  let target = '';
  let visible = '';
  let cursor = 0;
  let credit = 0;
  let lastFrameAt = 0;
  let cancelFrame: (() => void) | undefined;
  let cancelled = false;
  const waiters: (() => void)[] = [];

  // 显示追上目标或被取消时统一结束等待，不遗留未完成的发送流程
  const resolveFinish = () => {
    if (cursor === target.length || cancelled) {
      for (const resolve of waiters.splice(0)) resolve();
    }
  };

  // 根据帧间时间分配字符预算，主线程停顿后也不突然倾倒积压全文
  const tick = () => {
    cancelFrame = undefined;
    if (cancelled) return;
    const now = scheduler.now();
    const elapsed = Math.min(intervalMs, Math.max(0, now - lastFrameAt));
    lastFrameAt = now;
    credit = Math.min(maxCharsPerTick, credit + (elapsed * maxCharsPerTick) / intervalMs);
    const budget = Math.floor(credit);
    const before = cursor;
    let advanced = 0;
    while (advanced < budget && cursor < target.length) {
      cursor += (target.codePointAt(cursor) ?? 0) > 0xffff ? 2 : 1;
      advanced++;
    }
    credit -= advanced;
    if (cursor !== before) {
      visible = target.slice(0, cursor);
      publish(visible);
    }
    if (!cancelled && cursor < target.length) cancelFrame = scheduler.request(tick);
    resolveFinish();
  };

  // 空闲期间不积累字符预算，新分片到达后再唤醒绘制循环
  const schedule = () => {
    if (!cancelled && cancelFrame === undefined && cursor < target.length) {
      lastFrameAt = scheduler.now();
      credit = 0;
      cancelFrame = scheduler.request(tick);
    }
  };

  // 直接追加网络增量，避免每个小分片都比较或重新拆分整篇文本
  const append = (chunk: string) => {
    if (cancelled || !chunk) return;
    target += chunk;
    schedule();
  };

  // 仅在JSON响应或最终正文修正时替换目标，普通SSE分片走追加路径
  const push = (value: string) => {
    if (cancelled || value === target) return;
    target = value;
    if (!target.startsWith(visible)) {
      cursor = 0;
      visible = '';
      publish('');
    }
    schedule();
  };

  // 等待显示追上当前目标，取消时也会结束等待
  const drain = (): Promise<void> => {
    if (cancelled || cursor === target.length) return Promise.resolve();
    return new Promise<void>((resolve) => {
      waiters.push(resolve);
      schedule();
    });
  };

  // 暂停显示推进并保留当前可见文本，停止请求时不会继续追加内容
  const cancel = () => {
    cancelled = true;
    cancelFrame?.();
    cancelFrame = undefined;
    resolveFinish();
  };

  return { append, push, drain, current: () => visible, cancel };
}
