import { copyFile, cp, lstat, mkdir, readdir, readlink, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const projectRoot = resolve(desktopRoot, '..');
const standaloneRoot = resolve(projectRoot, '.next', 'standalone');
const stagingRoot = resolve(desktopRoot, '.build', 'next');

// 递归复制 standalone，并把 pnpm 符号链接物化为普通文件
async function copyTree(source, destination, activeSources = new Set()) {
  const sourcePath = resolve(source);
  const sourceStat = await lstat(sourcePath);

  if (sourceStat.isSymbolicLink()) {
    const linkTarget = await readlink(sourcePath);
    const targetPath = isAbsolute(linkTarget) ? linkTarget : resolve(dirname(sourcePath), linkTarget);

    try {
      await lstat(targetPath);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }

    return copyTree(targetPath, destination, activeSources);
  }

  if (activeSources.has(sourcePath)) {
    throw new Error(`Cyclic standalone dependency link detected at ${sourcePath}.`);
  }

  activeSources.add(sourcePath);
  try {
    if (sourceStat.isDirectory()) {
      await mkdir(destination, { recursive: true });
      for (const entry of await readdir(sourcePath, { withFileTypes: true })) {
        await copyTree(join(sourcePath, entry.name), join(destination, entry.name), activeSources);
      }
      return;
    }

    await mkdir(dirname(destination), { recursive: true });
    await copyFile(sourcePath, destination);
  } finally {
    activeSources.delete(sourcePath);
  }
}

await rm(stagingRoot, { force: true, recursive: true });
await copyTree(standaloneRoot, stagingRoot);
// 展开 pnpm 的顶层依赖别名，保持 Node.js 的模块解析路径完整
await copyTree(join(standaloneRoot, 'node_modules', '.pnpm', 'node_modules'), join(stagingRoot, 'node_modules'));
await cp(resolve(projectRoot, 'public'), resolve(stagingRoot, 'public'), { dereference: true, recursive: true });
await cp(resolve(projectRoot, '.next', 'static'), resolve(stagingRoot, '.next', 'static'), {
  dereference: true,
  recursive: true,
});
await cp(resolve(projectRoot, 'src', 'content'), resolve(stagingRoot, 'src', 'content'), {
  dereference: true,
  recursive: true,
});

for (const entry of await readdir(stagingRoot)) {
  if (entry.startsWith('.env')) {
    await rm(resolve(stagingRoot, entry), { force: true, recursive: true });
  }
}

await rm(resolve(stagingRoot, 'pnpm-lock.yaml'), { force: true });
