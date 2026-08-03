import { NextResponse } from 'next/server';

import { proxyStreamAgentMessage } from '@/features/apps/agent/agent-v1-server-proxy';

export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const payload: unknown = await request.json().catch(() => null);
  const result = await proxyStreamAgentMessage(id, payload);
  if ('body' in result) return NextResponse.json(result.body, { status: result.status });

  return new Response(result.stream, {
    status: result.status,
    headers: {
      'Content-Type': result.contentType,
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
