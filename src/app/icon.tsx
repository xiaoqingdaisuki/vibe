/** 生成浏览器与应用安装所需的高分辨率图标 */

import { createPwaIconResponse } from './pwa-icon';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

// 生成 Chromium 等浏览器用于安装应用的高分辨率图标
export default function Icon() {
  return createPwaIconResponse(size.width);
}
