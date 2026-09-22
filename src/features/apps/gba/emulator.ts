import type { GbaButton, GbaRom, GbaSpeed } from './types.ts';
import { serializeGbaCheats } from './cheats.ts';
import type { GbaCheat } from './types.ts';
import { getRomFileName } from './rom.ts';

const DEFAULT_VOLUME = 1;

const CLEAN_CHEAT_STATE_SLOT = 98;
const RUNTIME_CHEAT_STATE_SLOT = 99;
const STATE_FLAGS_WITH_CHEATS = 31;
// SAVESTATE_ALL 去掉 SAVESTATE_CHEATS，避免旧金手指覆盖当前核心
const RUNTIME_CHEAT_STATE_FLAGS = 27;
const EMPTY_CHEAT_SET = '!disabled\n# __vibe_empty_cheat_set__\n';

type EmulatorFileSystem = {
  readFile: (path: string) => Uint8Array;
  writeFile: (path: string, data: Uint8Array) => void;
  analyzePath: (path: string) => { exists: boolean };
  unlink: (path: string) => void;
};

type MgbaModule = {
  FS: EmulatorFileSystem;
  FSInit: () => Promise<void>;
  FSSync: () => Promise<void>;
  loadGame: (romPath: string, savePathOverride?: string) => boolean;
  getSave: () => Uint8Array | null;
  pauseGame: () => void;
  resumeGame: () => void;
  quitGame: () => void;
  quitMgba: () => void;
  quickReload: () => void;
  autoLoadCheats: () => boolean;
  saveStateSlot: (slot: number, flags: number) => boolean;
  loadStateSlot: (slot: number, flags: number) => boolean;
  setVolume: (volume: number) => void;
  setFastForwardMultiplier: (multiplier: number) => void;
  toggleInput: (enabled: boolean) => void;
  setCoreSettings: (settings: Record<string, boolean | number>) => void;
  addCoreCallbacks: (callbacks: { saveDataUpdatedCallback?: () => void; videoFrameEndedCallback?: () => void }) => void;
  version: { projectName: string; projectVersion: string };
  filePaths: () => { cheatsPath: string; gamePath: string; savePath: string; saveStatePath: string };
};

type MgbaFactory = (options: {
  canvas: HTMLCanvasElement;
  locateFile?: (path: string, prefix: string) => string;
}) => Promise<MgbaModule>;

// 从同源静态资源动态导入 Emscripten loader，避免把大段 glue code 放进 Next bundle
async function loadMgbaFactory(): Promise<MgbaFactory> {
  const globalScope = window as Window & { __VIBE_MGBA_FACTORY__?: unknown };
  if (typeof globalScope.__VIBE_MGBA_FACTORY__ === 'function') {
    return globalScope.__VIBE_MGBA_FACTORY__ as MgbaFactory;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/assets/gba/loader.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('无法加载 mGBA WASM loader。'));
    document.head.appendChild(script);
  });

  if (typeof globalScope.__VIBE_MGBA_FACTORY__ !== 'function') {
    throw new Error('mGBA WASM loader 没有暴露有效的模拟器工厂。');
  }
  return globalScope.__VIBE_MGBA_FACTORY__ as MgbaFactory;
}

export interface GbaEmulatorCallbacks {
  onSaveDirty: () => void;
  onFrame: () => void;
}

// 通过固定路径加载 WASM 二进制，避免打包器把大文件内联进页面脚本
function locateWasmFile(path: string): string {
  if (!path.endsWith('.wasm')) return path;
  return new URL('/assets/gba/mgba.wasm', window.location.href).toString();
}

// 删除虚拟文件系统中上一次会话留下的同名文件
function removeVirtualFile(fileSystem: EmulatorFileSystem, path: string): void {
  try {
    if (fileSystem.analyzePath(path).exists) fileSystem.unlink(path);
  } catch {
    // 文件不存在时无需阻止新 ROM 启动。
  }
}

// 读取临时状态文件，保留用户原有的同槽位存档
function readVirtualFile(fileSystem: EmulatorFileSystem, path: string): Uint8Array | null {
  try {
    if (!fileSystem.analyzePath(path).exists) return null;
    return new Uint8Array(fileSystem.readFile(path));
  } catch {
    throw new Error(`无法读取临时状态文件：${path}`);
  }
}

export class GbaEmulator {
  private readonly module: MgbaModule;

  private readonly coreReady: Promise<void>;

  private readonly coreCallbacks: {
    saveDataUpdatedCallback: () => void;
    videoFrameEndedCallback: () => void;
  };

  private volume = DEFAULT_VOLUME;

  private cheatPath: string | null = null;

  private statePath: string | null = null;

  private cleanStatePath: string | null = null;

  private cleanStateReady = false;

  private activeCheats: GbaCheat[] = [];

  // 保存 WASM 模块并隐藏其复杂的生命周期管理
  private constructor(
    module: MgbaModule,
    coreReady: Promise<void>,
    coreCallbacks: {
      saveDataUpdatedCallback: () => void;
      videoFrameEndedCallback: () => void;
    },
  ) {
    this.module = module;
    this.coreReady = coreReady;
    this.coreCallbacks = coreCallbacks;
  }

  // 初始化 mGBA WASM 模块并配置 60 FPS 音画同步
  static async create(canvas: HTMLCanvasElement, callbacks: GbaEmulatorCallbacks): Promise<GbaEmulator> {
    if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      throw new Error('当前页面未启用跨源隔离，请刷新 /lab/gba 后再试。');
    }

    canvas.width = 240;
    canvas.height = 160;
    const factory = await loadMgbaFactory();
    const runtime = await factory({ canvas, locateFile: locateWasmFile });
    await runtime.FSInit();
    runtime.setCoreSettings({
      audioSync: true,
      autoSaveStateEnable: false,
      baseFpsTarget: 60,
      restoreAutoSaveStateOnLoad: false,
      threadedVideo: false,
      timestepSync: true,
      videoSync: true,
    });
    runtime.setFastForwardMultiplier(1);
    runtime.toggleInput(false);

    let resolveCoreReady: (() => void) | null = null;
    const coreReady = new Promise<void>((resolve) => {
      resolveCoreReady = resolve;
    });

    // 首帧到达后再允许调用需要运行线程的 mGBA 接口
    function handleVideoFrame(): void {
      resolveCoreReady?.();
      resolveCoreReady = null;
      callbacks.onFrame();
    }

    return new GbaEmulator(runtime, coreReady, {
      saveDataUpdatedCallback: callbacks.onSaveDirty,
      videoFrameEndedCallback: handleVideoFrame,
    });
  }

  // 将 ROM 和已有电池存档写入 WASM 虚拟文件系统并启动游戏
  loadRom(rom: GbaRom, saveData: Uint8Array | null): void {
    const paths = this.module.filePaths();
    const romPath = `${paths.gamePath}/${getRomFileName(rom.name, rom.hash)}`;
    const savePath = `${paths.savePath}/vibe-${rom.hash.slice(0, 16)}.sav`;
    const cheatFileName = getRomFileName(rom.name, rom.hash).replace(/\.gba$/iu, '.cheats');
    const cheatPath = `${paths.cheatsPath}/${cheatFileName}`;
    const stateFileName = getRomFileName(rom.name, rom.hash).replace(/\.gba$/iu, '');
    const statePath = `${paths.saveStatePath}/${stateFileName}.ss${RUNTIME_CHEAT_STATE_SLOT}`;
    const cleanStatePath = `${paths.saveStatePath}/${stateFileName}.ss${CLEAN_CHEAT_STATE_SLOT}`;
    removeVirtualFile(this.module.FS, romPath);
    removeVirtualFile(this.module.FS, savePath);
    removeVirtualFile(this.module.FS, cheatPath);
    removeVirtualFile(this.module.FS, statePath);
    removeVirtualFile(this.module.FS, cleanStatePath);
    this.module.FS.writeFile(romPath, rom.bytes);
    if (saveData?.byteLength) this.module.FS.writeFile(savePath, saveData);
    this.cheatPath = cheatPath;
    this.statePath = statePath;
    this.cleanStatePath = cleanStatePath;
    this.cleanStateReady = false;
    this.activeCheats = [];

    if (!this.module.loadGame(romPath, savePath)) {
      throw new Error('WASM 核心无法识别或启动该 ROM。');
    }
    this.module.addCoreCallbacks(this.coreCallbacks);
  }

  // 写入当前 ROM 的金手指文件，空列表会移除旧文件
  private writeCheatFile(cheats: readonly GbaCheat[]): boolean {
    if (!this.cheatPath) throw new Error('当前没有已加载的 ROM。');

    removeVirtualFile(this.module.FS, this.cheatPath);
    const serialized = serializeGbaCheats(cheats);
    if (!serialized) return false;

    this.module.FS.writeFile(this.cheatPath, new TextEncoder().encode(serialized));
    if (!this.module.FS.analyzePath(this.cheatPath).exists) {
      throw new Error(`mGBA 金手指文件未写入：${this.cheatPath}`);
    }
    return true;
  }

  // 建立带空金手指集合的基准状态，用来清空当前核心的旧代码
  private ensureCleanCheatState(): void {
    if (!this.cheatPath || !this.cleanStatePath) throw new Error('当前没有已加载的 ROM。');
    if (this.cleanStateReady) return;

    this.module.pauseGame();
    removeVirtualFile(this.module.FS, this.cleanStatePath);
    removeVirtualFile(this.module.FS, this.cheatPath);
    this.module.FS.writeFile(this.cheatPath, new TextEncoder().encode(EMPTY_CHEAT_SET));
    if (!this.module.autoLoadCheats()) throw new Error('mGBA 无法建立金手指安全基准。');
    if (!this.module.saveStateSlot(CLEAN_CHEAT_STATE_SLOT, STATE_FLAGS_WITH_CHEATS)) {
      throw new Error('无法建立金手指安全基准。');
    }
    this.cleanStateReady = true;
  }

  // 从安全基准恢复当前进度，再在现有核心中加载新金手指
  private replaceCheatsInCurrentCore(cheats: readonly GbaCheat[]): void {
    if (!this.cheatPath || !this.statePath) throw new Error('当前没有已加载的 ROM。');

    if (!this.module.loadStateSlot(CLEAN_CHEAT_STATE_SLOT, STATE_FLAGS_WITH_CHEATS)) {
      throw new Error('无法清理旧金手指，当前游戏未改变。');
    }
    if (!this.module.loadStateSlot(RUNTIME_CHEAT_STATE_SLOT, RUNTIME_CHEAT_STATE_FLAGS)) {
      throw new Error('无法恢复当前游戏进度，金手指未应用。');
    }

    if (this.writeCheatFile(cheats) && !this.module.autoLoadCheats()) {
      throw new Error('mGBA 无法解析这组金手指代码。');
    }
  }

  // 写入 mGBA 金手指文件并让原生解析器加载所有代码类型
  async applyCheats(cheats: readonly GbaCheat[]): Promise<void> {
    try {
      await this.replaceCheats(cheats);
    } finally {
      this.module.resumeGame();
    }
  }

  // 事务式替换金手指，不重载 ROM，失败时恢复旧代码或无金手指核心
  async replaceCheats(cheats: readonly GbaCheat[]): Promise<void> {
    if (!this.statePath || !this.cleanStatePath) throw new Error('当前没有已加载的 ROM。');

    await this.coreReady;
    const unchanged =
      this.activeCheats.length === cheats.length &&
      this.activeCheats.every((activeCheat, index) => {
        const nextCheat = cheats[index];
        return (
          activeCheat.id === nextCheat.id &&
          activeCheat.name === nextCheat.name &&
          activeCheat.code === nextCheat.code &&
          activeCheat.enabled === nextCheat.enabled
        );
      });
    if (unchanged) return;

    this.ensureCleanCheatState();
    this.module.pauseGame();
    const previousCheats = this.activeCheats.map((cheat) => ({ ...cheat }));
    const previousState = readVirtualFile(this.module.FS, this.statePath);
    removeVirtualFile(this.module.FS, this.statePath);
    let stateSaved = false;

    try {
      stateSaved = this.module.saveStateSlot(RUNTIME_CHEAT_STATE_SLOT, RUNTIME_CHEAT_STATE_FLAGS);
      if (!stateSaved) throw new Error('无法保存当前游戏进度，金手指未应用。');
      this.replaceCheatsInCurrentCore(cheats);
      this.activeCheats = cheats.map((cheat) => ({ ...cheat }));
      await this.module.FSSync();
    } catch (error) {
      if (stateSaved) {
        try {
          this.replaceCheatsInCurrentCore(previousCheats);
          this.activeCheats = previousCheats;
        } catch (restoreError) {
          try {
            this.replaceCheatsInCurrentCore([]);
            this.activeCheats = [];
          } catch (normalCoreError) {
            const restoreMessage = restoreError instanceof Error ? restoreError.message : '旧金手指恢复失败';
            const normalCoreMessage = normalCoreError instanceof Error ? normalCoreError.message : '正常核心恢复失败';
            throw new Error(`金手指应用失败：${restoreMessage}；${normalCoreMessage}`);
          }
        }
      }
      throw error;
    } finally {
      removeVirtualFile(this.module.FS, this.statePath);
      if (previousState) this.module.FS.writeFile(this.statePath, previousState);
      try {
        await this.module.FSSync();
      } catch {
        // 临时状态文件清理失败不影响已经恢复的游戏核心。
      }
    }
  }

  // 返回当前核心实际使用的金手指，供失败回滚后同步页面列表
  getActiveCheats(): GbaCheat[] {
    return this.activeCheats.map((cheat) => ({ ...cheat }));
  }

  // 暂停模拟器和声音输出
  pause(): void {
    this.module.pauseGame();
  }

  // 恢复模拟器和声音输出
  resume(): void {
    this.module.resumeGame();
  }

  // 重新加载当前 ROM，保留已经写入的游戏存档
  reset(): void {
    this.module.quickReload();
  }

  // 设置静音状态，同时保留恢复时的音量
  setMuted(muted: boolean): void {
    this.module.setVolume(muted ? 0 : this.volume);
  }

  // 设置 mGBA 核心运行倍速，直接影响模拟器的实际执行速度
  setSpeed(speed: GbaSpeed): void {
    this.module.setFastForwardMultiplier(speed);
  }

  // 读取当前核心中的电池存档快照
  readSave(): Uint8Array | null {
    const save = this.module.getSave();
    return save ? new Uint8Array(save) : null;
  }

  // 返回当前 WASM 核心版本，写入存档元数据便于排查兼容性
  getVersion(): string {
    return `${this.module.version.projectName} ${this.module.version.projectVersion}`;
  }

  // 向模拟器按下一个 GBA 按键
  press(button: GbaButton): void {
    const moduleWithInput = this.module as MgbaModule & { buttonPress: (name: string) => void };
    moduleWithInput.buttonPress(button);
  }

  // 释放一个 GBA 按键
  release(button: GbaButton): void {
    const moduleWithInput = this.module as MgbaModule & { buttonUnpress: (name: string) => void };
    moduleWithInput.buttonUnpress(button);
  }

  // 退出当前游戏并释放 WASM 线程与音频资源
  destroy(): void {
    try {
      this.module.quitGame();
      this.module.quitMgba();
    } catch {
      // 运行时已经退出时，清理操作保持幂等。
    }
  }
}

// 创建 GBA 模拟器实例，保持页面只依赖一个简单的工厂函数
export async function createGbaEmulator(
  canvas: HTMLCanvasElement,
  callbacks: GbaEmulatorCallbacks,
): Promise<GbaEmulator> {
  return GbaEmulator.create(canvas, callbacks);
}
