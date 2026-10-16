import { NextResponse } from 'next/server';

import { proxyGetAgentCapabilities } from '@/features/apps/agent/agent-v1-server-proxy';

export const maxDuration = 30;

// 获取 Agent 能力配置，供前端区分临时附件和持久知识库附件。
export async function GET(request: Request): Promise<NextResponse> {
  const userId = new URL(request.url).searchParams.get('user_id') ?? '';
  const result = await proxyGetAgentCapabilities(userId);
  return NextResponse.json(result.body, { status: result.status });
}
