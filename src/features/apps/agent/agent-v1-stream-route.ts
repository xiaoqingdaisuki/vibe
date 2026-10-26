/** AI 助手：流式消息路由处理 */

import { AGENT_STREAM_IDLE_TIMEOUT_HEADER, AGENT_STREAM_TIMEOUT_HEADER } from './agent-timeout-contract.ts';
import { getAgentStreamIdleTimeoutMs, getAgentStreamTimeoutMs } from './agent-timeout.ts';
import { proxyStreamAgentMessage } from './agent-v1-server-proxy.ts';

export interface AgentStreamRouteContext {
  params: Promise<{ id: string }>;
}

type StreamAgentMessageProxy = typeof proxyStreamAgentMessage;

// 解析流式消息请求并把客户端取消信号传递给上游代理
export async function handleAgentStreamPost(
  request: Request,
  context: AgentStreamRouteContext,
  proxy: StreamAgentMessageProxy = proxyStreamAgentMessage,
): Promise<Response> {
  const { id } = await context.params;
  const contentType = request.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('multipart/form-data')
    ? await request.formData().catch(() => null)
    : await request.json().catch(() => null);
  const result = await proxy(id, payload, request.signal);
  if ('body' in result) {
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(result.stream, {
    status: result.status,
    headers: {
      'Content-Type': result.contentType,
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      [AGENT_STREAM_TIMEOUT_HEADER]: String(getAgentStreamTimeoutMs()),
      [AGENT_STREAM_IDLE_TIMEOUT_HEADER]: String(getAgentStreamIdleTimeoutMs()),
    },
  });
}
