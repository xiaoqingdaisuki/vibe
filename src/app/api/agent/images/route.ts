import { NextResponse } from 'next/server';

import { proxyAgentImage } from '@/features/apps/agent/agent-image-server-proxy';

export async function POST(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json().catch(() => null);
  const result = await proxyAgentImage(payload);
  return NextResponse.json(result.body, { status: result.status });
}
