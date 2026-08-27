import { createPwaIconResponse } from './pwa-icon';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

// 生成 iOS 主屏幕使用的 180 像素触控图标
export default function AppleIcon() {
  return createPwaIconResponse(size.width);
}
