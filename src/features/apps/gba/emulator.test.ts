import assert from 'node:assert/strict';
import test from 'node:test';
import { GbaEmulator } from './emulator.ts';
import { getRomFileName } from './rom.ts';
import type { GbaCheat, GbaRom } from './types.ts';

type TestModule = {
  FS: {
    readFile: (path: string) => Uint8Array;
    writeFile: (path: string, data: Uint8Array) => void;
    analyzePath: (path: string) => { exists: boolean };
    unlink: (path: string) => void;
  };
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

type EmulatorConstructor = new (
  module: TestModule,
  coreReady: Promise<void>,
  callbacks: { saveDataUpdatedCallback: () => void; videoFrameEndedCallback: () => void },
) => GbaEmulator;

function createTestRuntime(autoLoadCheats: () => boolean): {
  emulator: GbaEmulator;
  files: Map<string, Uint8Array>;
  stats: { loadGame: number; quickReload: number; saveState: number; loadState: number };
} {
  const files = new Map<string, Uint8Array>();
  const stats = { loadGame: 0, quickReload: 0, saveState: 0, loadState: 0 };
  const runtimeModule: TestModule = {
    FS: {
      readFile: (path) => {
        const data = files.get(path);
        if (!data) throw new Error(`missing ${path}`);
        return new Uint8Array(data);
      },
      writeFile: (path, data) => files.set(path, new Uint8Array(data)),
      analyzePath: (path) => ({ exists: files.has(path) }),
      unlink: (path) => files.delete(path),
    },
    FSSync: async () => undefined,
    loadGame: () => {
      stats.loadGame += 1;
      return true;
    },
    getSave: () => null,
    pauseGame: () => undefined,
    resumeGame: () => undefined,
    quitGame: () => undefined,
    quitMgba: () => undefined,
    quickReload: () => {
      stats.quickReload += 1;
    },
    autoLoadCheats,
    saveStateSlot: () => {
      stats.saveState += 1;
      return true;
    },
    loadStateSlot: () => {
      stats.loadState += 1;
      return true;
    },
    setVolume: () => undefined,
    setFastForwardMultiplier: () => undefined,
    toggleInput: () => undefined,
    setCoreSettings: () => undefined,
    addCoreCallbacks: () => undefined,
    version: { projectName: 'mGBA', projectVersion: 'test' },
    filePaths: () => ({
      cheatsPath: '/data/cheats',
      gamePath: '/data/games',
      savePath: '/data/saves',
      saveStatePath: '/data/states',
    }),
  };
  const constructor = GbaEmulator as unknown as EmulatorConstructor;
  const emulator = new constructor(runtimeModule, Promise.resolve(), {
    saveDataUpdatedCallback: () => undefined,
    videoFrameEndedCallback: () => undefined,
  });
  return { emulator, files, stats };
}

const ROM: GbaRom = {
  name: 'test.gba',
  bytes: new Uint8Array([1, 2, 3]),
  hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  size: 3,
};

const CHEAT: GbaCheat = {
  id: 'money',
  name: 'Money',
  code: '830050A8 1388',
  enabled: true,
};

test('replaces runtime cheats without quick-resetting the visible game', async () => {
  const runtime = createTestRuntime(() => true);
  runtime.emulator.loadRom(ROM, null);
  await runtime.emulator.applyCheats([CHEAT]);

  await runtime.emulator.replaceCheats([]);

  const cheatPath = `/data/cheats/${getRomFileName(ROM.name, ROM.hash).replace(/\.gba$/iu, '.cheats')}`;
  assert.equal(runtime.stats.loadGame, 1);
  assert.equal(runtime.stats.quickReload, 0);
  assert.equal(runtime.stats.saveState, 3);
  assert.equal(runtime.stats.loadState, 4);
  assert.equal(runtime.files.has(cheatPath), false);
  assert.deepEqual(runtime.emulator.getActiveCheats(), []);
});

test('rolls back invalid runtime cheats while keeping the previous list active', async () => {
  let autoLoadCalls = 0;
  const runtime = createTestRuntime(() => {
    autoLoadCalls += 1;
    return autoLoadCalls !== 3;
  });
  runtime.emulator.loadRom(ROM, null);
  await runtime.emulator.applyCheats([CHEAT]);

  await assert.rejects(() => runtime.emulator.replaceCheats([{ ...CHEAT, code: 'INVALID' }]));

  assert.equal(runtime.stats.quickReload, 0);
  assert.equal(runtime.stats.loadGame, 1);
  assert.deepEqual(runtime.emulator.getActiveCheats(), [CHEAT]);
  assert.equal(autoLoadCalls, 4);
});
