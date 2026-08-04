interface ImageProxyResult {
  status: number;
  body: { imageDataUrl: string } | { error: { message: string } };
}

const DEFAULT_AGENT_API_BASE_URL = '';

// 构造错误响应结果
function errorResult(message: string, status: number): ImageProxyResult {
  return { status, body: { error: { message } } };
}

// 根据环境变量构造图像生成API URL
function getImageApiUrl(): string | null {
  const baseUrl = process.env.AGENT_API_BASE_URL ?? DEFAULT_AGENT_API_BASE_URL;

  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return new URL('/images/generations', url).toString();
  } catch {
    return null;
  }
}

// 代理图像生成请求到上游StepFun API
export async function proxyAgentImage(payload: unknown): Promise<ImageProxyResult> {
  const prompt =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).prompt
      : null;

  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) {
    return errorResult('请输入 1 到 2000 个字符的图片描述。', 400);
  }

  const imageApiUrl = getImageApiUrl();
  if (!imageApiUrl) {
    return errorResult('AGENT_API_BASE_URL 配置无效。', 500);
  }

  let upstream: Response;
  try {
    upstream = await fetch(imageApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim() }),
      cache: 'no-store',
    });
  } catch {
    return errorResult('无法连接图像服务，请检查本地后端是否已启动。', 503);
  }

  const upstreamPayload: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const error =
      typeof upstreamPayload === 'object' && upstreamPayload !== null && !Array.isArray(upstreamPayload)
        ? (upstreamPayload as { error?: unknown }).error
        : undefined;
    return errorResult(typeof error === 'string' ? error : '图像生成暂时不可用。', upstream.status);
  }

  const imageDataUrl =
    typeof upstreamPayload === 'object' && upstreamPayload !== null && !Array.isArray(upstreamPayload)
      ? (upstreamPayload as { image_data_url?: unknown }).image_data_url
      : undefined;
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    return errorResult('图像服务返回了无效响应。', 502);
  }

  return { status: 200, body: { imageDataUrl } };
}
