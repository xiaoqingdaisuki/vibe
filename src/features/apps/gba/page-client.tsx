'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Button } from '@/components/base/Button';
import { createGbaCheat, normalizeGbaCheatCode, sanitizeGbaCheats } from './cheats';
import { loadGbaCheats, saveGbaCheats } from './cheat-storage';
import { createGbaEmulator, type GbaEmulator } from './emulator';
import { copyBytesToArrayBuffer, formatRomSize, readGbaRom } from './rom';
import { loadGbaSave, requestPersistentStorage, saveGbaSave } from './save-storage';
import { getNextGbaSpeed } from './speed';
import { confirmGbaReset } from './reset-confirmation';
import { GBA_KEY_BINDINGS } from './keyboard';
import type { GbaButton, GbaCheat, GbaPhase, GbaRom, GbaSpeed } from './types';
import styles from './styles/Gba.module.css';

const PHASE_LABELS: Record<GbaPhase, string> = {
  empty: '等待 ROM',
  error: '启动失败',
  loading: '加载中',
  paused: '已暂停',
  running: '运行中',
};

// 将未知金手指异常转换为用户可理解的提示
function getCheatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'mGBA 无法解析这组金手指代码。';
}

interface VirtualButtonProps {
  button: GbaButton;
  className?: string;
  label: string;
  onPress: (button: GbaButton) => void;
  onRelease: (button: GbaButton) => void;
}

// 渲染支持按住操作的触屏按键，并统一处理指针事件
function VirtualButton({ button, className = '', label, onPress, onRelease }: VirtualButtonProps) {
  // 处理触屏按键按下，阻止页面滚动和文本选中
  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onPress(button);
  }

  // 处理触屏按键释放，确保模拟器不会遗留粘滞按键
  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    onRelease(button);
  }

  return (
    <button
      className={className}
      type="button"
      aria-label={label}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {label}
    </button>
  );
}

// 渲染 GBA 模拟器页面并管理 ROM、WASM、输入与存档生命周期
export default function GbaEmulatorApp() {
  // 保存应用根节点，作为移动端全屏横屏容器
  const appRef = useRef<HTMLDivElement>(null);
  // 保存 Canvas 节点，交给 mGBA WASM 绑定视频输出
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 保存文件选择器节点，允许顶部按钮重复选择同一个 ROM
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 保存当前 WASM 模块，避免每次状态更新重新创建模拟器
  const emulatorRef = useRef<GbaEmulator | null>(null);
  // 保存当前 ROM 元数据，供存档和导出操作读取
  const romRef = useRef<GbaRom | null>(null);
  // 保存当前运行阶段给全局键盘监听使用
  const phaseRef = useRef<GbaPhase>('empty');
  // 保存当前按下的键，窗口失焦时可以逐个释放
  const pressedButtonsRef = useRef<Set<GbaButton>>(new Set());
  // 保存金手指弹窗状态，避免弹窗内输入触发游戏键盘控制
  const cheatModalRef = useRef(false);
  // 保存组件是否仍然挂载，避免异步加载完成后更新已卸载页面
  const mountedRef = useRef(true);
  // 保存当前存档写入函数，供 visibilitychange 监听器调用
  const persistSaveRef = useRef<() => Promise<void>>(async () => undefined);
  // 保存是否已经收到核心的存档变化通知
  const saveDirtyRef = useRef(false);
  // 保存是否已经收到第一帧，避免每帧触发 React 重渲染
  const frameReadyRef = useRef(false);

  // 管理模拟器所处阶段，驱动页面按钮和画面提示
  const [phase, setPhase] = useState<GbaPhase>('empty');
  // 管理当前错误文本，避免把 WASM 异常直接暴露给用户
  const [errorMessage, setErrorMessage] = useState('');
  // 管理 ROM 读取和 WASM 初始化阶段的提示文本
  const [loadingMessage, setLoadingMessage] = useState('准备加载 WASM 核心…');
  // 管理当前加载 ROM 的元数据
  const [rom, setRom] = useState<GbaRom | null>(null);
  // 管理静音按钮的显示状态
  const [muted, setMuted] = useState(false);
  // 管理最近一次成功保存的时间
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // 管理存档状态提示
  const [saveMessage, setSaveMessage] = useState('尚未保存');
  // 管理画面是否已经收到第一帧，仅用于运行状态反馈
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  // 管理当前模拟器运行倍速，按工具栏按钮循环切换
  const [speed, setSpeed] = useState<GbaSpeed>(1);
  // 管理当前 ROM 的金手指列表与弹窗编辑草稿
  const [cheats, setCheats] = useState<GbaCheat[]>([]);
  const [draftCheats, setDraftCheats] = useState<GbaCheat[]>([]);
  const [isCheatModalOpen, setIsCheatModalOpen] = useState(false);
  const [cheatName, setCheatName] = useState('');
  const [cheatCode, setCheatCode] = useState('');
  const [cheatError, setCheatError] = useState('');
  const [isApplyingCheats, setIsApplyingCheats] = useState(false);
  // 管理移动端触屏控制是否处于全屏模式
  const [isTouchFullscreen, setIsTouchFullscreen] = useState(false);

  // 同步阶段引用，供不重新绑定的事件监听器读取最新状态
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // 同步金手指弹窗状态，阻止弹窗打开时向游戏转发键盘事件
  useEffect(() => {
    cheatModalRef.current = isCheatModalOpen;
  }, [isCheatModalOpen]);

  // 监听 Escape，为金手指弹窗提供统一关闭方式
  useEffect(() => {
    if (!isCheatModalOpen || isApplyingCheats) return undefined;

    // 按 Escape 关闭金手指弹窗
    function handleCheatEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setIsCheatModalOpen(false);
    }

    window.addEventListener('keydown', handleCheatEscape);
    return () => window.removeEventListener('keydown', handleCheatEscape);
  }, [isApplyingCheats, isCheatModalOpen]);

  // 将当前存档写入 IndexedDB，并更新界面上的保存状态
  async function persistCurrentSave(): Promise<void> {
    const emulator = emulatorRef.current;
    const currentRom = romRef.current;
    if (!emulator || !currentRom) return;

    const data = emulator.readSave();
    if (!data?.byteLength) {
      setSaveMessage('该 ROM 尚未创建电池存档');
      return;
    }

    setSaveMessage('正在保存…');
    try {
      await saveGbaSave({
        coreVersion: emulator.getVersion(),
        data: copyBytesToArrayBuffer(data),
        romHash: currentRom.hash,
        updatedAt: Date.now(),
      });
      saveDirtyRef.current = false;
      if (mountedRef.current) {
        setLastSavedAt(Date.now());
        setSaveMessage('已保存到本机');
      }
    } catch {
      if (mountedRef.current) setSaveMessage('保存失败，请检查浏览器存储权限');
    }
  }

  // 创建实例、加载 ROM、应用金手指并恢复当前页面的运行设置
  async function createLoadedEmulator(
    nextRom: GbaRom,
    saveData: ArrayBuffer | null,
    nextCheats: readonly GbaCheat[],
  ): Promise<GbaEmulator> {
    if (!canvasRef.current) throw new Error('找不到 GBA 画布，无法启动模拟器。');

    frameReadyRef.current = false;
    setHasRenderedFrame(false);
    const nextEmulator = await createGbaEmulator(canvasRef.current, {
      onFrame: () => {
        if (frameReadyRef.current) return;
        frameReadyRef.current = true;
        if (mountedRef.current) setHasRenderedFrame(true);
      },
      onSaveDirty: () => {
        saveDirtyRef.current = true;
      },
    });

    try {
      nextEmulator.loadRom(nextRom, saveData ? new Uint8Array(saveData) : null);
      try {
        await nextEmulator.applyCheats(nextCheats);
      } catch (error) {
        if (!nextCheats.length) throw error;
        await nextEmulator.applyCheats([]);
      }
      nextEmulator.setSpeed(speed);
      if (muted) nextEmulator.setMuted(true);
      return nextEmulator;
    } catch (error) {
      nextEmulator.destroy();
      throw error;
    }
  }

  // 释放当前按键、保存存档并销毁旧的 WASM 实例
  async function stopCurrentEmulator(): Promise<void> {
    await persistCurrentSave();
    for (const button of pressedButtonsRef.current) emulatorRef.current?.release(button);
    pressedButtonsRef.current.clear();
    emulatorRef.current?.destroy();
    emulatorRef.current = null;
    romRef.current = null;
  }

  // 读取文件、恢复存档并启动新的 GBA 会话
  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canvasRef.current) return;

    setPhase('loading');
    setErrorMessage('');
    setLoadingMessage('正在读取 ROM…');
    let loadingEmulator: GbaEmulator | null = null;
    try {
      const nextRom = await readGbaRom(file, ({ loaded, total }) => {
        setLoadingMessage(`正在读取 ROM… ${Math.round((loaded / total) * 100)}%`);
      });
      await stopCurrentEmulator();
      setRom(nextRom);
      romRef.current = nextRom;
      setLoadingMessage('正在初始化 WASM 核心…');
      const storedSave = await loadGbaSave(nextRom.hash);
      const storedCheats = loadGbaCheats(nextRom.hash);
      loadingEmulator = await createLoadedEmulator(nextRom, storedSave?.data ?? null, storedCheats);
      emulatorRef.current = loadingEmulator;
      const activeCheats = loadingEmulator.getActiveCheats();
      const cheatsDisabled = storedCheats.length > 0 && activeCheats.length === 0;
      const displayedCheats = cheatsDisabled
        ? storedCheats.map((cheat) => ({ ...cheat, enabled: false }))
        : storedCheats;
      setCheats(displayedCheats);
      if (cheatsDisabled) saveGbaCheats(nextRom.hash, displayedCheats);
      saveDirtyRef.current = false;
      setSaveMessage(storedSave ? '已恢复本机存档' : '尚未保存');
      setLastSavedAt(storedSave?.updatedAt ?? null);
      setPhase('running');
      void requestPersistentStorage();
    } catch (error) {
      if (loadingEmulator && emulatorRef.current === loadingEmulator) {
        loadingEmulator.destroy();
        emulatorRef.current = null;
      }
      await stopCurrentEmulator();
      setRom(null);
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : '模拟器启动失败，请换一个 ROM 重试。');
    }
  }

  // 让文件选择器获得焦点，开始加载新的 ROM
  function handleChooseRom(): void {
    fileInputRef.current?.click();
  }

  // 切换移动端全屏，并在支持时锁定横屏方向
  async function handleToggleTouchFullscreen(): Promise<void> {
    const app = appRef.current;
    if (!app) return;

    try {
      if (document.fullscreenElement === app) {
        await document.exitFullscreen();
        return;
      }

      await app.requestFullscreen();
      try {
        const lockOrientation = Reflect.get(window.screen.orientation, 'lock');
        if (typeof lockOrientation === 'function') {
          await Reflect.apply(lockOrientation, window.screen.orientation, ['landscape']);
        }
      } catch {
        // 部分浏览器只支持全屏，不支持脚本锁定方向。
      }
    } catch {
      // 当前浏览器拒绝全屏时保持普通页面布局。
    }
  }

  // 暂停或恢复当前模拟器
  function handleTogglePause(): void {
    const emulator = emulatorRef.current;
    if (!emulator) return;
    if (phase === 'running') {
      emulator.pause();
      setPhase('paused');
    } else if (phase === 'paused') {
      emulator.resume();
      setPhase('running');
    }
  }

  // 二次确认后保存电池存档，再让核心重新加载当前 ROM
  async function handleReset(): Promise<void> {
    if (!emulatorRef.current || !romRef.current) return;
    if (!confirmGbaReset(window.confirm.bind(window))) return;

    await persistCurrentSave();
    emulatorRef.current.reset();
    setPhase('running');
  }

  // 手动触发一次电池存档写入
  function handleSave(): void {
    void persistCurrentSave();
  }

  // 切换模拟器音量，并在下一次切换时恢复默认音量
  function handleToggleMute(): void {
    const nextMuted = !muted;
    emulatorRef.current?.setMuted(nextMuted);
    setMuted(nextMuted);
  }

  // 循环切换运行倍速，并同步更新 mGBA 核心的实际执行速度
  function handleCycleSpeed(): void {
    const emulator = emulatorRef.current;
    if (!emulator) return;
    const nextSpeed = getNextGbaSpeed(speed);
    emulator.setSpeed(nextSpeed);
    setSpeed(nextSpeed);
  }

  // 打开金手指编辑弹窗，并复制当前列表作为可撤销草稿
  function handleOpenCheats(): void {
    setDraftCheats(cheats.map((cheat) => ({ ...cheat })));
    setCheatName('');
    setCheatCode('');
    setCheatError('');
    setIsCheatModalOpen(true);
  }

  // 关闭金手指弹窗并放弃本次未应用的草稿修改
  function handleCloseCheats(): void {
    if (isApplyingCheats) return;
    setCheatError('');
    setIsCheatModalOpen(false);
  }

  // 点击弹窗遮罩时关闭金手指编辑器
  function handleCheatBackdropClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) handleCloseCheats();
  }

  // 将顶部输入的代码追加到当前金手指草稿列表
  function handleAddCheat(): void {
    const normalizedCode = normalizeGbaCheatCode(cheatCode);
    if (!normalizedCode) {
      setCheatError('请输入至少一行金手指代码。');
      return;
    }

    setDraftCheats((current) => [...current, createGbaCheat({ name: cheatName, code: normalizedCode })]);
    setCheatName('');
    setCheatCode('');
    setCheatError('');
  }

  // 更新列表中指定金手指的名称、代码或启用状态
  function handleUpdateCheat(id: string, patch: Partial<Omit<GbaCheat, 'id'>>): void {
    const nextPatch = patch.code === undefined ? patch : { ...patch, code: normalizeGbaCheatCode(patch.code) };
    setDraftCheats((current) => current.map((cheat) => (cheat.id === id ? { ...cheat, ...nextPatch } : cheat)));
  }

  // 从编辑草稿中删除指定金手指
  function handleRemoveCheat(id: string): void {
    setDraftCheats((current) => current.filter((cheat) => cheat.id !== id));
  }

  // 在当前游戏进度上替换金手指，失败时保留可继续编辑的代码列表
  async function handleApplyCheats(): Promise<void> {
    const currentRom = romRef.current;
    const currentEmulator = emulatorRef.current;
    if (!currentRom || !currentEmulator || isApplyingCheats) return;

    const nextCheats = sanitizeGbaCheats(draftCheats);
    if (nextCheats.length !== draftCheats.length) {
      setCheatError('请填写代码或删除空白代码后再应用。');
      return;
    }

    const wasRunning = phase === 'running';

    setIsApplyingCheats(true);
    setCheatError('');

    try {
      for (const button of pressedButtonsRef.current) currentEmulator.release(button);
      pressedButtonsRef.current.clear();
      if (wasRunning) currentEmulator.pause();
      await currentEmulator.replaceCheats(nextCheats);
      setCheats(nextCheats);
      saveGbaCheats(currentRom.hash, nextCheats);
      setPhase(wasRunning ? 'running' : 'paused');
      setIsCheatModalOpen(false);
    } catch (error) {
      const actualCheats = currentEmulator.getActiveCheats();
      setCheats(actualCheats);
      saveGbaCheats(currentRom.hash, actualCheats);
      setPhase(wasRunning ? 'running' : 'paused');
      setCheatError(`应用失败：${getCheatErrorMessage(error)} 当前游戏进度已保留，请修正代码后重试。`);
    } finally {
      if (wasRunning) currentEmulator.resume();
      setIsApplyingCheats(false);
    }
  }

  // 把当前电池存档下载为 .sav 文件，方便用户自行备份
  function handleExportSave(): void {
    const data = emulatorRef.current?.readSave();
    const currentRom = romRef.current;
    if (!data?.byteLength || !currentRom) {
      setSaveMessage('当前没有可导出的电池存档');
      return;
    }

    const url = URL.createObjectURL(new Blob([copyBytesToArrayBuffer(data)], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentRom.name.replace(/\.gba$/i, '')}.sav`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // 发送虚拟按键按下事件，并记录当前按键集合
  function handleButtonPress(button: GbaButton): void {
    if (!emulatorRef.current || phaseRef.current === 'empty' || phaseRef.current === 'error') return;
    emulatorRef.current.press(button);
    pressedButtonsRef.current.add(button);
  }

  // 发送虚拟按键释放事件，避免多个指针造成重复释放
  function handleButtonRelease(button: GbaButton): void {
    if (!pressedButtonsRef.current.has(button)) return;
    emulatorRef.current?.release(button);
    pressedButtonsRef.current.delete(button);
  }

  // 释放窗口失焦时仍然按住的所有虚拟按键
  function releaseAllButtons(): void {
    for (const button of pressedButtonsRef.current) emulatorRef.current?.release(button);
    pressedButtonsRef.current.clear();
  }

  // 同步浏览器全屏状态，并在离开全屏时释放所有触屏按键
  useEffect(() => {
    function handleFullscreenChange(): void {
      const active = document.fullscreenElement === appRef.current;
      setIsTouchFullscreen(active);
      if (!active) {
        releaseAllButtons();
        try {
          window.screen.orientation?.unlock();
        } catch {
          // 浏览器不支持解锁方向时无需额外处理。
        }
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 导出存档写入函数，供页面隐藏或切换时的生命周期监听器调用
  useEffect(() => {
    persistSaveRef.current = persistCurrentSave;
  });

  // 绑定键盘、窗口失焦和页面隐藏事件
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const button = GBA_KEY_BINDINGS[event.code];
      if (cheatModalRef.current || !button || (phaseRef.current !== 'running' && phaseRef.current !== 'paused')) return;
      event.preventDefault();
      if (!pressedButtonsRef.current.has(button)) handleButtonPress(button);
    }

    function handleKeyUp(event: KeyboardEvent): void {
      const button = GBA_KEY_BINDINGS[event.code];
      if (!button) return;
      event.preventDefault();
      handleButtonRelease(button);
    }

    function handleVisibilityChange(): void {
      if (document.hidden) {
        releaseAllButtons();
        void persistSaveRef.current();
        if (phaseRef.current === 'running') {
          emulatorRef.current?.pause();
          setPhase('paused');
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseAllButtons);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseAllButtons);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 每 15 秒检查一次核心是否产生新存档并写入 IndexedDB
  useEffect(() => {
    if (phase !== 'running') return undefined;
    const interval = window.setInterval(() => {
      if (saveDirtyRef.current) void persistSaveRef.current();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [phase]);

  // 组件卸载时保存存档并释放 WASM 资源
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      releaseAllButtons();
      void persistSaveRef.current();
      emulatorRef.current?.destroy();
      emulatorRef.current = null;
    };
  }, []);

  const isPlayable = phase === 'running' || phase === 'paused';
  const isPaused = phase === 'paused';
  const overlayTitle = isPaused
    ? '游戏已暂停'
    : phase === 'loading'
      ? loadingMessage
      : phase === 'error'
        ? '无法启动这个 ROM'
        : '选择一个 .gba 文件开始';
  const overlayText = isPaused
    ? '当前画面已冻结，点击继续游戏恢复运行。'
    : phase === 'error'
      ? errorMessage
      : 'ROM 只在当前浏览器内存中运行，不会上传到服务器。';

  return (
    <div ref={appRef} className={styles.app}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>WASM / Canvas</p>
          <h1 className={styles.title}>GBA emulator</h1>
          <p className={styles.subtitle}>在浏览器运行Game Boy Advance ROM。游戏存档保存在本地浏览器中。</p>
        </div>
        <div className={styles.actions}>
          <input
            ref={fileInputRef}
            className={styles.fileInput}
            type="file"
            accept=".gba"
            onChange={handleFileChange}
          />
          <Button type="button" onClick={handleChooseRom}>
            选择 ROM
          </Button>
          <Button type="button" variant="secondary" disabled={!isPlayable} onClick={handleTogglePause}>
            {phase === 'paused' ? '继续' : '暂停'}
          </Button>
        </div>
      </header>

      <main className={styles.workspace}>
        <section className={styles.screenPanel} aria-labelledby="gba-screen-title">
          <div className={styles.screenHeader}>
            <h2 id="gba-screen-title" className={styles.panelTitle}>
              游戏画面
            </h2>
            <div className={styles.screenStatuses}>
              <span className={`${styles.status} ${phase === 'error' ? styles.statusError : ''}`}>
                {PHASE_LABELS[phase]}
              </span>
              <span className={styles.status}>{hasRenderedFrame ? `${speed}x · ${60 * speed} FPS` : '等待画面'}</span>
            </div>
          </div>
          <div className={styles.screen}>
            <canvas ref={canvasRef} className={styles.canvas} width={240} height={160} aria-label="GBA 游戏画面" />
            {isPaused || !isPlayable ? (
              <div
                className={`${styles.screenOverlay} ${isPaused ? styles.pauseOverlay : ''}`}
                role={phase === 'error' ? 'alert' : undefined}
              >
                <div className={styles.overlayContent}>
                  <p className={styles.overlayTitle}>{overlayTitle}</p>
                  <p className={styles.overlayText}>{overlayText}</p>
                  {isPaused ? (
                    <Button type="button" size="sm" onClick={handleTogglePause}>
                      继续游戏
                    </Button>
                  ) : phase === 'empty' || phase === 'error' ? (
                    <Button type="button" size="sm" onClick={handleChooseRom}>
                      打开本地 ROM
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <p className={styles.screenHint}>
            键盘：方向键移动，X / Z 为 A / B，A / S 为 L / R，Enter 为 Start，左 Shift 为 Select。
          </p>
        </section>

        <aside className={styles.controlsPanel} aria-label="GBA 控制器">
          <div className={styles.controlHeader}>
            <div className={styles.controlHeaderText}>
              <h2 className={styles.panelTitle}>控制器</h2>
            </div>
          </div>
          <div className={styles.controlDeck}>
            <div className={styles.controlGrid}>
              <VirtualButton
                button="up"
                className={`${styles.controlButton} ${styles.up}`}
                label="↑"
                onPress={handleButtonPress}
                onRelease={handleButtonRelease}
              />
              <VirtualButton
                button="left"
                className={`${styles.controlButton} ${styles.left}`}
                label="←"
                onPress={handleButtonPress}
                onRelease={handleButtonRelease}
              />
              <VirtualButton
                button="down"
                className={`${styles.controlButton} ${styles.down}`}
                label="↓"
                onPress={handleButtonPress}
                onRelease={handleButtonRelease}
              />
              <VirtualButton
                button="right"
                className={`${styles.controlButton} ${styles.right}`}
                label="→"
                onPress={handleButtonPress}
                onRelease={handleButtonRelease}
              />
            </div>
            <div className={styles.faceButtons}>
              <VirtualButton
                button="b"
                className={`${styles.faceButton} ${styles.faceButtonB}`}
                label="B"
                onPress={handleButtonPress}
                onRelease={handleButtonRelease}
              />
              <VirtualButton
                button="a"
                className={`${styles.faceButton} ${styles.faceButtonA}`}
                label="A"
                onPress={handleButtonPress}
                onRelease={handleButtonRelease}
              />
            </div>
            <div className={styles.extraButtons}>
              <div className={styles.shoulderButtons}>
                <VirtualButton
                  button="l"
                  className={styles.shoulderButton}
                  label="L"
                  onPress={handleButtonPress}
                  onRelease={handleButtonRelease}
                />
                <VirtualButton
                  button="r"
                  className={styles.shoulderButton}
                  label="R"
                  onPress={handleButtonPress}
                  onRelease={handleButtonRelease}
                />
              </div>
              <div className={styles.systemButtons}>
                <VirtualButton
                  button="select"
                  className={styles.systemButton}
                  label="Select"
                  onPress={handleButtonPress}
                  onRelease={handleButtonRelease}
                />
                <VirtualButton
                  button="start"
                  className={styles.systemButton}
                  label="Start"
                  onPress={handleButtonPress}
                  onRelease={handleButtonRelease}
                />
              </div>
            </div>
          </div>
          <div className={styles.controlActions}>
            <Button
              className={styles.fullscreenAction}
              type="button"
              size="sm"
              variant="secondary"
              aria-label={isTouchFullscreen ? '退出全屏' : '切换全屏'}
              onClick={() => void handleToggleTouchFullscreen()}
            >
              {isTouchFullscreen ? '退出全屏' : '切换全屏'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!isPlayable}
              aria-label={`运行速率 ${speed} 倍，点击切换下一档`}
              title="点击切换 1x、2x、4x、8x"
              onClick={handleCycleSpeed}
            >
              速度 {speed}x
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={!isPlayable} onClick={handleOpenCheats}>
              金手指{cheats.length ? ` ${cheats.filter((cheat) => cheat.enabled).length}/${cheats.length}` : ''}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={!isPlayable} onClick={handleSave}>
              立即保存
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={!isPlayable} onClick={handleExportSave}>
              导出存档 .sav
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={!isPlayable} onClick={handleToggleMute}>
              {muted ? '打开声音' : '静音'}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={!isPlayable} onClick={() => void handleReset()}>
              重置游戏
            </Button>
          </div>
          <p className={styles.saveHint} role="status">
            {saveMessage}
            {lastSavedAt ? ` · ${new Date(lastSavedAt).toLocaleTimeString('zh-CN')}` : ''}
          </p>
        </aside>

        <section className={styles.infoPanel} aria-labelledby="gba-info-title">
          <div className={styles.infoHeader}>
            <h2 id="gba-info-title" className={styles.panelTitle}>
              当前 ROM
            </h2>
          </div>
          {rom ? (
            <dl className={styles.infoList}>
              <div className={styles.infoRow}>
                <dt>文件</dt>
                <dd>{rom.name}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt>大小</dt>
                <dd>{formatRomSize(rom.size)}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt>存档标识</dt>
                <dd>{rom.hash.slice(0, 12)}…</dd>
              </div>
            </dl>
          ) : (
            <p className={styles.infoText}>打开 ROM 后，这里会显示文件信息。ROM 和存档都不会离开当前浏览器。</p>
          )}
        </section>
      </main>
      {isCheatModalOpen ? (
        <div className={styles.modalBackdrop} onMouseDown={handleCheatBackdropClick}>
          <section
            className={styles.cheatModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gba-cheat-dialog-title"
          >
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>mGBA / Cheats</p>
                <h2 id="gba-cheat-dialog-title" className={styles.modalTitle}>
                  金手指
                </h2>
              </div>
              <Button type="button" size="sm" variant="ghost" disabled={isApplyingCheats} onClick={handleCloseCheats}>
                关闭
              </Button>
            </header>
            <div className={styles.modalBody}>
              <p className={styles.cheatNotice}>
                自动识别金手指代码格式。错误代码可能导致游戏卡死或存档异常，建议先保存进度。
              </p>
              <div className={styles.cheatInputPanel}>
                <div className={styles.cheatFields}>
                  <label className={styles.cheatField} htmlFor="gba-cheat-name">
                    <span>名称（可选）</span>
                    <input
                      id="gba-cheat-name"
                      type="text"
                      value={cheatName}
                      placeholder="例如：无限金钱"
                      disabled={isApplyingCheats}
                      onChange={(event) => setCheatName(event.target.value)}
                    />
                  </label>
                </div>
                <label className={styles.cheatField} htmlFor="gba-cheat-code">
                  <span>输入代码（支持多行）</span>
                  <textarea
                    id="gba-cheat-code"
                    rows={3}
                    value={cheatCode}
                    placeholder={'例如：\n830050A8 1388\n4203C354 0001'}
                    disabled={isApplyingCheats}
                    onChange={(event) => setCheatCode(event.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isApplyingCheats}
                  onClick={handleAddCheat}
                >
                  添加到列表
                </Button>
              </div>
              {cheatError ? <p className={styles.modalError}>{cheatError}</p> : null}
              <div className={styles.cheatList}>
                <div className={styles.cheatListHeader}>
                  <h3 className={styles.cheatListTitle}>已执行金手指</h3>
                  <span className={styles.cheatCount}>{draftCheats.length} 条</span>
                </div>
                {draftCheats.length ? (
                  draftCheats.map((cheat) => (
                    <article key={cheat.id} className={styles.cheatItem}>
                      <div className={styles.cheatItemHeader}>
                        <label className={styles.cheatToggle}>
                          <input
                            type="checkbox"
                            checked={cheat.enabled}
                            disabled={isApplyingCheats}
                            onChange={(event) => handleUpdateCheat(cheat.id, { enabled: event.target.checked })}
                          />
                          <span>{cheat.enabled ? '已启用' : '已关闭'}</span>
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isApplyingCheats}
                          onClick={() => handleRemoveCheat(cheat.id)}
                        >
                          删除
                        </Button>
                      </div>
                      <div className={styles.cheatFields}>
                        <label className={styles.cheatField} htmlFor={`gba-cheat-name-${cheat.id}`}>
                          <span>名称</span>
                          <input
                            id={`gba-cheat-name-${cheat.id}`}
                            type="text"
                            value={cheat.name}
                            disabled={isApplyingCheats}
                            onChange={(event) => handleUpdateCheat(cheat.id, { name: event.target.value })}
                          />
                        </label>
                      </div>
                      <label className={styles.cheatField} htmlFor={`gba-cheat-code-${cheat.id}`}>
                        <span>代码（可编辑多行）</span>
                        <textarea
                          id={`gba-cheat-code-${cheat.id}`}
                          rows={Math.min(6, Math.max(3, cheat.code.split('\n').length))}
                          value={cheat.code}
                          disabled={isApplyingCheats}
                          onChange={(event) => handleUpdateCheat(cheat.id, { code: event.target.value })}
                        />
                      </label>
                    </article>
                  ))
                ) : (
                  <p className={styles.emptyCheats}>还没有代码，先在上方输入一组金手指。</p>
                )}
              </div>
            </div>
            <footer className={styles.modalFooter}>
              <p className={styles.modalHint}>
                应用会在当前游戏进程中即时替换金手指，不会重启 ROM；解析失败时会恢复正常画面。
              </p>
              <div className={styles.modalActions}>
                <Button type="button" size="sm" variant="ghost" disabled={isApplyingCheats} onClick={handleCloseCheats}>
                  取消
                </Button>
                <Button type="button" size="sm" disabled={isApplyingCheats} onClick={() => void handleApplyCheats()}>
                  {isApplyingCheats ? '正在应用…' : '应用并关闭'}
                </Button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
