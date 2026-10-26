/** 将 mGBA 模块工厂暴露给应用侧模拟器加载流程 */

import createMgba from './mgba.js';

globalThis.__VIBE_MGBA_FACTORY__ = createMgba;
