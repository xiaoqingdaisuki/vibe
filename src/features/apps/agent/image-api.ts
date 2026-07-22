export interface GeneratedImage {
  imageDataUrl: string;
}

const IMAGE_API_URL = '/api/agent/images';

function getErrorMessage(payload: unknown, status: number): string {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return `图像请求失败（HTTP ${status}）。`;
  }

  const error = (payload as Record<string, unknown>).error;
  if (typeof error === 'object' && error !== null && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message) return message;
  }

  return `图像请求失败（HTTP ${status}）。`;
}

export async function generateAgentImage(prompt: string): Promise<GeneratedImage> {
  let response: Response;
  try {
    response = await fetch(IMAGE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  } catch {
    throw new Error('无法连接图像服务，请稍后重试。');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(payload, response.status));

  const imageDataUrl =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).imageDataUrl
      : undefined;
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    throw new Error('图像服务返回了无效响应。');
  }

  return { imageDataUrl };
}
