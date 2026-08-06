import { proxyAgentRequest } from '@/features/apps/agent/agent-server-proxy';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

interface AgentRouteContext {
  params: Promise<{ path: string[] }>;
}

// 将任意受支持的Agent接口请求交给统一安全代理
async function handleAgentRequest(request: Request, context: AgentRouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyAgentRequest(request, path);
}

export {
  handleAgentRequest as DELETE,
  handleAgentRequest as GET,
  handleAgentRequest as PATCH,
  handleAgentRequest as POST,
  handleAgentRequest as PUT,
};
