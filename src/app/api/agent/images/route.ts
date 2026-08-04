import { NextResponse } from 'next/server';

import { proxyAgentImage } from '@/features/apps/agent/agent-image-server-proxy';

// 图像生成代理端点，接收提示词并返回StepFun生成的图片
export async function POST(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json().catch(() => null);
  const result = await proxyAgentImage(payload);
  return NextResponse.json(result.body, { status: result.status });
}
