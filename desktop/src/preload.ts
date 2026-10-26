/** Electron 预加载入口，维护渲染进程的隔离边界 */

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('vibeDesktop', {
  isDesktop: true,
  platform: process.platform,
  electronVersion: process.versions.electron,
});
