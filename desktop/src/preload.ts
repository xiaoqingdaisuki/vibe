import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('vibeDesktop', {
  isDesktop: true,
  platform: process.platform,
  electronVersion: process.versions.electron,
});
