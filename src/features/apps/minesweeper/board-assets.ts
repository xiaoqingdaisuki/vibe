export interface BoardAssets {
  flag: HTMLImageElement;
  mine: HTMLImageElement;
  detonatedMine: HTMLImageElement;
}

interface BoardAssetColors {
  accent: string;
  foreground: string;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

// 将 SVG 字符串编码为 data URL
function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// 将 SVG 字符串加载为 Image 元素（带 Promise 缓存）
function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const cachedImage = imageCache.get(svg);
  if (cachedImage) return cachedImage;

  const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('扫雷 SVG 素材加载失败。')), { once: true });
    image.src = toSvgDataUrl(svg);
  });

  imageCache.set(svg, imagePromise);
  return imagePromise;
}

// 生成指定颜色的旗帜 SVG 字符串
function createFlagSvg(color: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
      <path d="M23 49V15" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
      <path d="M25 16L47 23L25 31Z" fill="${color}"/>
      <path d="M14 50H35" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
    </svg>
  `;
}

// 生成指定颜色的地雷 SVG 字符串
function createMineSvg(color: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
      <g stroke="${color}" stroke-width="4" stroke-linecap="round">
        <path d="M32 9V17M32 47V55M9 32H17M47 32H55"/>
        <path d="M16 16L22 22M42 42L48 48M48 16L42 22M22 42L16 48"/>
      </g>
      <circle cx="32" cy="32" r="14" fill="${color}"/>
      <circle cx="27" cy="27" r="3" fill="#ffffff"/>
    </svg>
  `;
}

// 并行加载旗帜、地雷和爆炸地雷图片素材
export async function loadBoardAssets(colors: BoardAssetColors): Promise<BoardAssets> {
  const [flag, mine, detonatedMine] = await Promise.all([
    loadSvgImage(createFlagSvg(colors.accent)),
    loadSvgImage(createMineSvg(colors.foreground)),
    loadSvgImage(createMineSvg(colors.accent)),
  ]);

  return { flag, mine, detonatedMine };
}
