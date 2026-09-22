import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const iconPath = resolve(desktopRoot, 'assets', 'vibe.ico');
const splashPath = resolve(desktopRoot, 'assets', 'vibe-splash.bmp');
const iconSizes = [16, 24, 32, 48, 64, 128, 256];
const purple = [124, 58, 237, 255];
const white = [255, 255, 255, 255];
const lavender = [221, 214, 254, 255];
const vPath = [
  [108, 128],
  [200, 128],
  [256, 296],
  [312, 128],
  [404, 128],
  [298, 392],
  [214, 392],
];

// 计算 PNG 分块所需的 CRC32 校验值
function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

// 生成一个带长度、类型和校验值的 PNG 数据块
function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

// 判断采样点是否落在 Vibe 的圆角紫色背景内
function isInsideRoundedSquare(x, y) {
  const radius = 112;
  const nearestX = Math.max(radius, Math.min(512 - radius, x));
  const nearestY = Math.max(radius, Math.min(512 - radius, y));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

// 判断采样点是否落在白色 V 标志的多边形内
function isInsidePolygon(x, y, points) {
  let inside = false;

  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const [currentX, currentY] = points[index];
    const [previousX, previousY] = points[previous];
    const intersects =
      currentY > y !== previousY > y &&
      x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;

    if (intersects) inside = !inside;
  }

  return inside;
}

// 根据 SVG 几何图形返回一个高分辨率采样点的颜色
function sampleIconColor(x, y) {
  if (!isInsideRoundedSquare(x, y)) return null;

  let color = purple;
  if (isInsidePolygon(x, y, vPath)) color = white;
  if ((x - 374) ** 2 + (y - 138) ** 2 <= 30 ** 2) color = lavender;
  return color;
}

// 以超采样方式生成指定尺寸的 RGBA PNG，保留圆角抗锯齿
function createPng(size) {
  const supersample = 4;
  const rows = Buffer.alloc(size * (size * 4 + 1));

  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0;

    for (let x = 0; x < size; x += 1) {
      const channels = [0, 0, 0, 0];
      const sampleCount = supersample ** 2;

      for (let sampleY = 0; sampleY < supersample; sampleY += 1) {
        for (let sampleX = 0; sampleX < supersample; sampleX += 1) {
          const iconX = ((x + (sampleX + 0.5) / supersample) / size) * 512;
          const iconY = ((y + (sampleY + 0.5) / supersample) / size) * 512;
          const color = sampleIconColor(iconX, iconY);

          if (!color) continue;
          channels[0] += color[0];
          channels[1] += color[1];
          channels[2] += color[2];
          channels[3] += color[3];
        }
      }

      const offset = y * (size * 4 + 1) + 1 + x * 4;
      rows[offset] = Math.round(channels[0] / sampleCount);
      rows[offset + 1] = Math.round(channels[1] / sampleCount);
      rows[offset + 2] = Math.round(channels[2] / sampleCount);
      rows[offset + 3] = Math.round(channels[3] / sampleCount);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n', 'binary'),
    createPngChunk('IHDR', header),
    createPngChunk('IDAT', deflateSync(rows, { level: 9 })),
    createPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// 将多尺寸 PNG 按 Windows ICO 格式组合成一个图标文件
function createIco(images) {
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  let offset = directory.length;
  for (const [index, image] of images.entries()) {
    const entryOffset = 6 + index * 16;
    directory.writeUInt8(image.size === 256 ? 0 : image.size, entryOffset);
    directory.writeUInt8(image.size === 256 ? 0 : image.size, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(image.data.length, entryOffset + 8);
    directory.writeUInt32LE(offset, entryOffset + 12);
    offset += image.data.length;
  }

  return Buffer.concat([directory, ...images.map((image) => image.data)]);
}

// 生成 Portable 解压阶段显示的 24 位 BMP 启动画面
function createSplashBitmap() {
  const width = 640;
  const height = 360;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowSize * height, 0);
  const logoLeft = 230;
  const logoTop = 42;
  const logoSize = 180;
  const progressLeft = 180;
  const progressTop = 292;
  const progressWidth = 280;
  const progressHeight = 8;
  const progressFill = 92;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color = [255, 255, 255];
      const iconX = ((x - logoLeft + 0.5) / logoSize) * 512;
      const iconY = ((y - logoTop + 0.5) / logoSize) * 512;
      const iconColor = sampleIconColor(iconX, iconY);

      if (iconColor) color = iconColor.slice(0, 3);

      const isProgressTrack =
        x >= progressLeft && x < progressLeft + progressWidth && y >= progressTop && y < progressTop + progressHeight;
      const isProgressFill = isProgressTrack && x < progressLeft + progressFill;

      if (isProgressTrack) color = isProgressFill ? purple.slice(0, 3) : lavender.slice(0, 3);

      const row = height - y - 1;
      const offset = row * rowSize + x * 3;
      pixels[offset] = color[2];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[0];
    }
  }

  const header = Buffer.alloc(54);
  header.write('BM', 0, 2, 'ascii');
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(0, 30);
  header.writeUInt32LE(pixels.length, 34);
  header.writeInt32LE(2835, 38);
  header.writeInt32LE(2835, 42);
  return Buffer.concat([header, pixels]);
}

const images = iconSizes.map((size) => ({ size, data: createPng(size) }));
await mkdir(dirname(iconPath), { recursive: true });
await writeFile(iconPath, createIco(images));
await writeFile(splashPath, createSplashBitmap());
