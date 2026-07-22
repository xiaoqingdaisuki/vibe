import { NextResponse } from 'next/server';

import { proxyAgentChat } from '@/features/apps/agent/agent-server-proxy';

export async function POST(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json().catch(() => null);
  const result = await proxyAgentChat(payload);
  return NextResponse.json(result.body, { status: result.status });
}
