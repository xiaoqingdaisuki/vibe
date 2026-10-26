/** 代理 AI 助手能力查询，向客户端提供附件与记忆能力配置 */

import { NextResponse } from 'next/server';

import { proxyGetAgentCapabilities } from '@/features/apps/agent/agent-v1-server-proxy';

export const maxDuration = 30;

// 获取 Agent 能力配置，供前端区分临时附件和持久知识库附件
export async function GET(request: Request): Promise<NextResponse> {
  const userId = new URL(request.url).searchParams.get('user_id') ?? '';
  const result = await proxyGetAgentCapabilities(userId);
  return NextResponse.json(result.body, { status: result.status });
}
