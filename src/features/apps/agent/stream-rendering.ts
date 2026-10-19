export const TEXT_RENDER_INTERVAL_MS = 30;
export const TEXT_RENDER_MAX_CHARS_PER_TICK = 50;
export const MARKDOWN_RENDER_INTERVAL_MS = 100;

export interface LatestValueBatch<T> {
  push(value: T): void;
  flush(): void;
  cancel(): void;
}

export interface StreamingTextPresenter {
  push(value: string): void;
  drain(): Promise<void>;
  current(): string;
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

// 将突发收到的全文按显示游标推进，避免网络合并后一次性替换整段内容
export function createStreamingTextPresenter(
  intervalMs: number,
  maxCharsPerTick: number,
  publish: (value: string) => void,
): StreamingTextPresenter {
  let target = '';
  let visible = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finishResolve: (() => void) | undefined;

  // 完成当前显示目标时唤醒发送流程，确保最终状态不会提前切换成全文
  const resolveFinish = () => {
    if (finishResolve && visible === target) {
      const resolve = finishResolve;
      finishResolve = undefined;
      resolve();
    }
  };

  // 按固定刷新间隔推进不超过配置上限的字符数
  const tick = () => {
    timer = undefined;
    const targetChars = Array.from(target);
    const visibleLength = Array.from(visible).length;
    if (visibleLength < targetChars.length) {
      const backlog = targetChars.length - visibleLength;
      const step = Math.min(maxCharsPerTick, backlog);
      visible = targetChars.slice(0, visibleLength + step).join('');
      publish(visible);
    }
    if (visible !== target) timer = setTimeout(tick, intervalMs);
    resolveFinish();
  };

  // 仅在显示目标尚未追上时安排一次计时器，避免重复定时器和渲染竞争
  const schedule = () => {
    if (timer === undefined && visible !== target) timer = setTimeout(tick, intervalMs);
  };

  // 接收最新完整目标文本，但只推进可见游标而不阻塞网络读取
  const push = (value: string) => {
    if (value === target) return;
    target = value;
    if (!target.startsWith(visible)) {
      visible = '';
      publish('');
    }
    schedule();
  };

  // 等待当前目标完整显示，网络突发时仍保留可见的打字过程
  const drain = () => {
    if (visible === target) return Promise.resolve();
    if (!finishResolve) {
      return new Promise<void>((resolve) => {
        finishResolve = resolve;
        schedule();
      });
    }
    return new Promise<void>((resolve) => {
      const previousResolve = finishResolve;
      if (!previousResolve) {
        finishResolve = resolve;
        schedule();
        return;
      }
      finishResolve = () => {
        previousResolve();
        resolve();
      };
    });
  };

  // 暂停显示推进并保留当前可见文本，停止请求时不会继续追加内容
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const resolve = finishResolve;
    finishResolve = undefined;
    resolve?.();
  };

  return { push, drain, current: () => visible, cancel };
}
