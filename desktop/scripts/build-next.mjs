import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const projectRoot = resolve(desktopRoot, '..');
const nextCliPath = resolve(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

// 转发 Next standalone 构建失败，确保桌面构建返回失败状态
function handleBuildError(error) {
  console.error('Failed to start the Next.js desktop build.', error);
  process.exitCode = 1;
}

// 将 Next 构建进程的退出状态传递给桌面构建命令
function handleBuildExit(code, signal) {
  if (signal) {
    console.error(`Next.js desktop build stopped by ${signal}.`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
}

const buildProcess = spawn(process.execPath, [nextCliPath, 'build'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    VIBE_DESKTOP_BUILD: 'true',
  },
  stdio: 'inherit',
  windowsHide: true,
});

buildProcess.once('error', handleBuildError);
buildProcess.once('exit', handleBuildExit);
