import type { GbaButton, GbaRom } from './types';
import { getRomFileName } from './rom';

const DEFAULT_VOLUME = 1;

type EmulatorFileSystem = {
  writeFile: (path: string, data: Uint8Array) => void;
  analyzePath: (path: string) => { exists: boolean };
  unlink: (path: string) => void;
};

type MgbaModule = {
  FS: EmulatorFileSystem;
  FSInit: () => Promise<void>;
  loadGame: (romPath: string, savePathOverride?: string) => boolean;
  getSave: () => Uint8Array | null;
  pauseGame: () => void;
  resumeGame: () => void;
  quitGame: () => void;
  quitMgba: () => void;
  quickReload: () => void;
  setVolume: (volume: number) => void;
  toggleInput: (enabled: boolean) => void;
  setCoreSettings: (settings: Record<string, boolean | number>) => void;
  addCoreCallbacks: (callbacks: { saveDataUpdatedCallback?: () => void; videoFrameEndedCallback?: () => void }) => void;
  version: { projectName: string; projectVersion: string };
  filePaths: () => { gamePath: string; savePath: string };
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

export class GbaEmulator {
  private readonly module: MgbaModule;

  private volume = DEFAULT_VOLUME;

  // 保存 WASM 模块并隐藏其复杂的生命周期管理
  private constructor(module: MgbaModule) {
    this.module = module;
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
    runtime.toggleInput(false);
    runtime.addCoreCallbacks({
      saveDataUpdatedCallback: callbacks.onSaveDirty,
      videoFrameEndedCallback: callbacks.onFrame,
    });
    return new GbaEmulator(runtime);
  }

  // 将 ROM 和已有电池存档写入 WASM 虚拟文件系统并启动游戏
  loadRom(rom: GbaRom, saveData: Uint8Array | null): void {
    const paths = this.module.filePaths();
    const romPath = `${paths.gamePath}/${getRomFileName(rom.name, rom.hash)}`;
    const savePath = `${paths.savePath}/vibe-${rom.hash.slice(0, 16)}.sav`;
    removeVirtualFile(this.module.FS, romPath);
    removeVirtualFile(this.module.FS, savePath);
    this.module.FS.writeFile(romPath, rom.bytes);
    if (saveData?.byteLength) this.module.FS.writeFile(savePath, saveData);

    if (!this.module.loadGame(romPath, savePath)) {
      throw new Error('WASM 核心无法识别或启动该 ROM。');
    }
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
