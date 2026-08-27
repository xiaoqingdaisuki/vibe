import { ImageResponse } from 'next/og';

// 生成与站点视觉一致的方形 PNG 安装图标
export function createPwaIconResponse(size: number): ImageResponse {
  return new ImageResponse(
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 512 512">
      <rect width="512" height="512" rx="112" fill="#7c3aed" />
      <path d="M108 128h92l56 168 56-168h92L298 392h-84L108 128Z" fill="#ffffff" />
      <circle cx="374" cy="138" r="30" fill="#ddd6fe" />
    </svg>,
    {
      width: size,
      height: size,
    },
  );
}
