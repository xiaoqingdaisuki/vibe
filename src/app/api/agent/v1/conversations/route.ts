import { NextResponse } from 'next/server';

import { proxyCreateAgentConversation } from '@/features/apps/agent/agent-v1-server-proxy';

export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json().catch(() => null);
  const result = await proxyCreateAgentConversation(payload);
  return NextResponse.json(result.body, { status: result.status });
}
