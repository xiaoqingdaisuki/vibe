import { getAgentRequestTimeoutMs } from './agent-timeout.ts';

interface ImageProxyResult {
  status: number;
  body: { imageDataUrl: string } | { error: { message: string } };
}

const DEFAULT_AGENT_API_BASE_URL = '';

// 判断未知值是否为普通对象
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 递归提取 TS 与 FastAPI 错误包络中的消息
function getUpstreamErrorMessage(payload: unknown, depth = 0): string | undefined {
  if (typeof payload === 'string') return payload.length <= 300 ? payload : undefined;
  if (!isRecord(payload) || depth > 3) return undefined;
  const direct = payload.message;
  if (typeof direct === 'string' && direct.length <= 300) return direct;
  return getUpstreamErrorMessage(payload.error, depth + 1) ?? getUpstreamErrorMessage(payload.detail, depth + 1);
}

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
  const apiSecret = process.env.AGENT_API_SECRET?.trim();
  if (!apiSecret) {
    return errorResult('AGENT_API_SECRET 配置缺失。', 500);
  }
  let upstream: Response;
  try {
    upstream = await fetch(imageApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: prompt.trim() }),
      signal: AbortSignal.timeout(getAgentRequestTimeoutMs()),
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return errorResult('图像生成超时，请稍后重试。', 504);
    }
    return errorResult('无法连接图像服务，请检查本地后端是否已启动。', 503);
  }

  const upstreamPayload: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return errorResult(getUpstreamErrorMessage(upstreamPayload) ?? '图像生成暂时不可用。', upstream.status);
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
