'use client';

import { type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/base/Button';
import { formatRomSize } from './rom';
import { useGbaSession } from './use-gba-session';
import type { GbaButton, GbaPhase } from './types';
import styles from './styles/Gba.module.css';

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

// 管理 GBA 页面展示所需的会话数据与操作
export default function GbaEmulatorApp() {
  const {
    refs: { appRef, canvasRef, fileInputRef },
    state: {
      phase,
      errorMessage,
      loadingMessage,
      rom,
      muted,
      lastSavedAt,
      saveMessage,
      hasRenderedFrame,
      speed,
      cheats,
      draftCheats,
      isCheatModalOpen,
      cheatName,
      cheatCode,
      cheatError,
      isApplyingCheats,
      isTouchFullscreen,
    },
    actions: {
      handleFileChange,
      handleChooseRom,
      handleToggleTouchFullscreen,
      handleTogglePause,
      handleReset,
      handleSave,
      handleToggleMute,
      handleCycleSpeed,
      handleOpenCheats,
      handleCloseCheats,
      handleCheatBackdropClick,
      handleCheatNameChange,
      handleCheatCodeChange,
      handleAddCheat,
      handleUpdateCheat,
      handleRemoveCheat,
      handleApplyCheats,
      handleExportSave,
      handleButtonPress,
      handleButtonRelease,
    },
  } = useGbaSession();

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
          <Button type="button" disabled={phase === 'loading'} onClick={handleChooseRom}>
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
                      onChange={(event) => handleCheatNameChange(event.target.value)}
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
                    onChange={(event) => handleCheatCodeChange(event.target.value)}
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
