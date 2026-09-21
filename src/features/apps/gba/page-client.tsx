'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ChangeEvent } from 'react';
import { Button } from '@/components/base/Button';
import { createGbaEmulator, type GbaEmulator } from './emulator';
import { copyBytesToArrayBuffer, formatRomSize, readGbaRom } from './rom';
import { loadGbaSave, requestPersistentStorage, saveGbaSave } from './save-storage';
import type { GbaButton, GbaPhase, GbaRom } from './types';
import styles from './styles/Gba.module.css';

const KEY_BINDINGS: Record<string, GbaButton> = {
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  Enter: 'start',
  KeyA: 'l',
  KeyS: 'r',
  KeyX: 'a',
  KeyZ: 'b',
  ShiftRight: 'select',
};

const PHASE_LABELS: Record<GbaPhase, string> = {
  empty: '等待 ROM',
  error: '启动失败',
  loading: '加载中',
  paused: '已暂停',
  running: '运行中',
};

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

  // 同步阶段引用，供不重新绑定的事件监听器读取最新状态
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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
      frameReadyRef.current = false;
      setHasRenderedFrame(false);
      loadingEmulator = await createGbaEmulator(canvasRef.current, {
        onFrame: () => {
          if (frameReadyRef.current) return;
          frameReadyRef.current = true;
          if (mountedRef.current) setHasRenderedFrame(true);
        },
        onSaveDirty: () => {
          saveDirtyRef.current = true;
        },
      });
      emulatorRef.current = loadingEmulator;
      loadingEmulator.loadRom(nextRom, storedSave ? new Uint8Array(storedSave.data) : null);
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

  // 先保存游戏内存档，再让核心重新加载当前 ROM
  async function handleReset(): Promise<void> {
    if (!emulatorRef.current || !romRef.current) return;
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

  // 导出存档写入函数，供页面隐藏或切换时的生命周期监听器调用
  useEffect(() => {
    persistSaveRef.current = persistCurrentSave;
  });

  // 绑定键盘、窗口失焦和页面隐藏事件
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const button = KEY_BINDINGS[event.code];
      if (!button || (phaseRef.current !== 'running' && phaseRef.current !== 'paused')) return;
      event.preventDefault();
      if (!pressedButtonsRef.current.has(button)) handleButtonPress(button);
    }

    function handleKeyUp(event: KeyboardEvent): void {
      const button = KEY_BINDINGS[event.code];
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
  const overlayTitle =
    phase === 'loading' ? loadingMessage : phase === 'error' ? '无法启动这个 ROM' : '选择一个 .gba 文件开始';
  const overlayText = phase === 'error' ? errorMessage : 'ROM 只在当前浏览器内存中运行，不会上传到服务器。';

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>WASM / Canvas</p>
          <h1 className={styles.title}>GBA emulator</h1>
          <p className={styles.subtitle}>
            在浏览器运行Game Boy Advance ROM。游戏内存档保存在本地浏览器中。
          </p>
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
            <span className={`${styles.status} ${phase === 'error' ? styles.statusError : ''}`}>
              {PHASE_LABELS[phase]}
            </span>
          </div>
          <div className={styles.screen}>
            <canvas ref={canvasRef} className={styles.canvas} width={240} height={160} aria-label="GBA 游戏画面" />
            {!isPlayable ? (
              <div className={styles.screenOverlay} role={phase === 'error' ? 'alert' : undefined}>
                <div className={styles.overlayContent}>
                  <p className={styles.overlayTitle}>{overlayTitle}</p>
                  <p className={styles.overlayText}>{overlayText}</p>
                  {phase === 'empty' || phase === 'error' ? (
                    <Button type="button" size="sm" onClick={handleChooseRom}>
                      打开本地 ROM
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <p className={styles.screenHint}>
            键盘：方向键移动，X / Z 为 A / B，A / S 为 L / R，Enter 为 Start，右 Shift 为 Select。
          </p>
        </section>

        <aside className={styles.controlsPanel} aria-label="GBA 控制器">
          <div className={styles.controlHeader}>
            <div className={styles.controlHeaderText}>
              <h2 className={styles.panelTitle}>触屏控制</h2>
              <p className={styles.controlHint}>按住按钮持续输入</p>
            </div>
            <span className={styles.status}>{hasRenderedFrame ? '60 FPS 目标' : '等待画面'}</span>
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
                className={styles.faceButton}
                label="B"
                onPress={handleButtonPress}
                onRelease={handleButtonRelease}
              />
              <VirtualButton
                button="a"
                className={styles.faceButton}
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
            <Button type="button" size="sm" variant="secondary" disabled={!isPlayable} onClick={handleSave}>
              立即保存
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={!isPlayable} onClick={handleExportSave}>
              导出 .sav
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
            <p className={styles.infoText}>选择 ROM 后，这里会显示文件信息。ROM 和存档都不会离开当前浏览器。</p>
          )}
        </section>
      </main>
    </div>
  );
}
