import { NextResponse } from 'next/server';

import { proxyGetAgentConversationMessages } from '@/features/apps/agent/agent-v1-server-proxy';

export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

// 获取指定会话的历史消息列表
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const userId = new URL(request.url).searchParams.get('user_id') ?? '';
  const result = await proxyGetAgentConversationMessages(id, userId);
  return NextResponse.json(result.body, { status: result.status });
}
