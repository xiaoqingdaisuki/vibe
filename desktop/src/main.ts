import { existsSync, readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';

import { app, BrowserWindow, dialog, shell, utilityProcess, type UtilityProcess } from 'electron';

const SERVER_START_TIMEOUT_MS = 30_000;
const SERVER_POLL_INTERVAL_MS = 150;
const projectRoot = resolve(__dirname, '..', '..');

let mainWindow: BrowserWindow | null = null;
let startupWindow: BrowserWindow | null = null;
let nextProcess: UtilityProcess | null = null;
let developmentProcess: ChildProcess | null = null;
let internalOrigin = '';
let isShuttingDown = false;

const startupMarkup = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>vibe</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        align-items: center;
        background: #ffffff;
        color: #555555;
        display: flex;
        font-family: Inter, "Segoe UI", sans-serif;
        height: 100vh;
        justify-content: center;
        margin: 0;
        overflow: hidden;
        width: 100vw;
      }
      main { align-items: center; display: flex; flex-direction: column; gap: 20px; }
      svg { display: block; height: 88px; width: 88px; }
      p { font-size: 14px; margin: 0; }
      .track { background: #ddd6fe; border-radius: 4px; height: 8px; overflow: hidden; width: 240px; }
      .bar {
        animation: loading 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        background: #7c3aed;
        height: 100%;
        width: 35%;
      }
      @keyframes loading {
        from { transform: translateX(-120%); }
        to { transform: translateX(320%); }
      }
    </style>
  </head>
  <body>
    <main>
      <svg viewBox="0 0 512 512" role="img" aria-label="vibe">
        <rect width="512" height="512" rx="112" fill="#7c3aed" />
        <path d="M108 128h92l56 168 56-168h92L298 392h-84L108 128Z" fill="#ffffff" />
        <circle cx="374" cy="138" r="30" fill="#ddd6fe" />
      </svg>
      <p id="status">正在启动本地服务…</p>
      <div class="track" aria-label="正在加载"><div class="bar"></div></div>
    </main>
  </body>
</html>`;

// 创建 Electron 阶段的启动窗口，覆盖本地服务启动等待时间
function createStartupWindow(): void {
  if (startupWindow && !startupWindow.isDestroyed()) return;

  startupWindow = new BrowserWindow({
    alwaysOnTop: true,
    backgroundColor: '#ffffff',
    center: true,
    frame: false,
    height: 300,
    resizable: false,
    show: true,
    skipTaskbar: true,
    title: 'vibe',
    width: 420,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  startupWindow.on('closed', () => {
    startupWindow = null;
  });
  void startupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(startupMarkup)}`);
}

// 更新启动窗口状态，让用户知道当前正在进行哪一步
function updateStartupStatus(status: string): void {
  if (!startupWindow || startupWindow.isDestroyed()) return;

  void startupWindow.webContents
    .executeJavaScript(`document.getElementById('status').textContent = ${JSON.stringify(status)};`, true)
    .catch(() => undefined);
}

// 关闭启动窗口并释放其资源
function closeStartupWindow(): void {
  if (!startupWindow || startupWindow.isDestroyed()) return;

  startupWindow.close();
  startupWindow = null;
}

// 等待指定时间，避免启动检查占用主进程事件循环
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

// 申请一个仅绑定回环地址的空闲端口，避免占用固定端口
function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();

    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();

      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('Unable to determine an available local port.'));
        return;
      }

      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

// 轮询本地 Next 服务，确保窗口加载时服务已经可以响应
async function waitForServer(serverUrl: URL): Promise<void> {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(serverUrl, {
        signal: AbortSignal.timeout(1_000),
      });
      await response.body?.cancel();

      if (response.status < 500) return;
    } catch {
      // 服务尚未监听端口，继续等待下一次检查
    }

    await delay(SERVER_POLL_INTERVAL_MS);
  }

  throw new Error(`Local Vibe server did not start within ${SERVER_START_TIMEOUT_MS / 1_000} seconds.`);
}

// 将本地服务进程输出转发到 Electron 控制台，便于诊断启动问题
function pipeProcessLogs(label: string, stream: NodeJS.ReadableStream | null): void {
  stream?.on('data', (chunk: Buffer | string) => {
    const message = chunk.toString().trimEnd();
    if (message) console.log(`[${label}] ${message}`);
  });
}

// 生成桌面端 Next 服务的运行时环境变量
function createServerEnvironment(port: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOSTNAME: '127.0.0.1',
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: app.isPackaged ? 'production' : 'development',
    PORT: String(port),
  };
}

// 读取便携版旁边的可选环境文件，避免将服务密钥打进发布包
function loadDesktopEnvironment(): void {
  const executableDirectory = process.env.PORTABLE_EXECUTABLE_DIR || dirname(process.execPath);
  const candidates = [
    process.env.VIBE_DESKTOP_ENV_FILE,
    join(executableDirectory, '.env'),
    join(executableDirectory, 'Vibe.env'),
  ].filter((value): value is string => Boolean(value));
  const environmentPath = candidates.find((candidate) => existsSync(candidate));

  if (!environmentPath) return;

  let source: string;
  try {
    source = readFileSync(environmentPath, 'utf8');
  } catch (error) {
    console.warn('Unable to read the Vibe desktop environment file.', error);
    return;
  }

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    const separatorIndex = line.indexOf('=');

    if (!line || line.startsWith('#') || separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

// 处理 standalone Next 服务异常退出，避免窗口继续显示失效页面
function handleNextProcessExit(code: number): void {
  nextProcess = null;

  if (isShuttingDown) return;

  console.error(`Vibe Next server exited with code ${code}.`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showErrorBox('Vibe 服务已停止', '本地 Vibe 服务意外退出，请重新启动应用。');
  }
  app.quit();
}

// 记录开发模式 Next 进程退出，避免开发进程异常时静默失败
function handleDevelopmentProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
  developmentProcess = null;

  if (isShuttingDown) return;

  console.error(`Vibe development server exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}.`);
}

// 启动开发模式或生产模式的本地 Next 服务并等待其就绪
async function startNextServer(): Promise<URL> {
  const port = await getFreePort();
  const serverUrl = new URL(`http://127.0.0.1:${port}`);
  const environment = createServerEnvironment(port);

  if (app.isPackaged) {
    const serverRoot = join(process.resourcesPath, 'next');
    const serverPath = join(serverRoot, 'server.js');

    nextProcess = utilityProcess.fork(serverPath, [], {
      cwd: serverRoot,
      env: environment,
      serviceName: 'Vibe Next Server',
      stdio: 'pipe',
    });
    pipeProcessLogs('next', nextProcess.stdout);
    pipeProcessLogs('next:error', nextProcess.stderr);
    nextProcess.once('exit', handleNextProcessExit);
  } else {
    const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';
    const commandArguments =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', `pnpm exec next dev --turbopack --port ${port}`]
        : ['exec', 'next', 'dev', '--turbopack', '--port', String(port)];

    developmentProcess = spawn(command, commandArguments, {
      cwd: projectRoot,
      env: environment,
      stdio: 'pipe',
      windowsHide: true,
    });
    pipeProcessLogs('next:dev', developmentProcess.stdout);
    pipeProcessLogs('next:dev:error', developmentProcess.stderr);
    developmentProcess.once('exit', handleDevelopmentProcessExit);
  }

  await waitForServer(serverUrl);
  return serverUrl;
}

// 停止本地 Next 服务，确保退出应用时不残留后台进程
function stopNextServer(): void {
  isShuttingDown = true;

  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }

  if (developmentProcess) {
    developmentProcess.kill();
    developmentProcess = null;
  }
}

// 判断导航目标是否仍在当前桌面端本地服务范围内
function isInternalUrl(target: string): boolean {
  try {
    return new URL(target).origin === internalOrigin;
  } catch {
    return false;
  }
}

// 仅允许安全的 HTTP(S) 外链交给系统默认浏览器处理
function openExternalUrl(target: string): void {
  try {
    const url = new URL(target);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      void shell.openExternal(url.toString());
    }
  } catch {
    // 忽略无效或不允许的外部地址
  }
}

// 限制窗口导航范围，防止页面内容跳转到任意 Electron 页面
function configureWindowNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternalUrl(url)) openExternalUrl(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return;

    event.preventDefault();
    openExternalUrl(url);
  });
}

// 创建主窗口并加载本地 Next 应用
async function createMainWindow(): Promise<void> {
  createStartupWindow();
  updateStartupStatus('正在启动本地服务…');
  const serverUrl = await startNextServer();
  updateStartupStatus('正在加载 Vibe 界面…');
  internalOrigin = serverUrl.origin;

  mainWindow = new BrowserWindow({
    backgroundColor: '#ffffff',
    height: 960,
    minHeight: 640,
    minWidth: 960,
    show: false,
    title: 'Vibe',
    width: 1440,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  configureWindowNavigation(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.once('ready-to-show', closeStartupWindow);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(serverUrl.toString());
}

// 处理 Electron 启动阶段的错误并清理本地服务
function handleStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown startup error.';
  console.error('Failed to start Vibe desktop.', error);
  closeStartupWindow();
  stopNextServer();
  dialog.showErrorBox('Vibe 启动失败', message);
  app.quit();
}

// 聚焦已经打开的窗口，阻止用户重复启动多个 Vibe 实例
function handleSecondInstance(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

// Electron 准备完成后启动本地 Next 服务和主窗口
async function handleApplicationReady(): Promise<void> {
  loadDesktopEnvironment();
  app.setAppUserModelId('com.xiaoqingdaisuki.vibe');
  await createMainWindow();
}

// macOS 重新激活应用时恢复主窗口
function handleApplicationActivate(): void {
  if (mainWindow) return;
  void createMainWindow().catch(handleStartupError);
}

// 非 macOS 平台关闭最后一个窗口时退出应用
function handleWindowAllClosed(): void {
  if (process.platform !== 'darwin') app.quit();
}

// Electron 退出前清理 standalone Next 服务
function handleBeforeQuit(): void {
  stopNextServer();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', handleSecondInstance);
  app.on('activate', handleApplicationActivate);
  app.on('before-quit', handleBeforeQuit);
  app.on('window-all-closed', handleWindowAllClosed);
  app.whenReady().then(handleApplicationReady).catch(handleStartupError);
}
