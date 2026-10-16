import { NextResponse } from 'next/server';

import { proxyDeleteAgentConversation } from '@/features/apps/agent/agent-v1-server-proxy';

export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

// 删除指定对话会话
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const userId = new URL(request.url).searchParams.get('user_id') ?? '';
  const result = await proxyDeleteAgentConversation(id, userId);
  return NextResponse.json(result.body, { status: result.status });
}
