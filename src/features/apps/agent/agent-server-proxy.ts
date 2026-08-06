const DEFAULT_TIMEOUT_MS = 105_000;
const MIN_TIMEOUT_MS = 95_000;
const MAX_TIMEOUT_MS = 110_000;
const ALLOWED_ROOT_SEGMENTS = new Set(['chat', 'health', 'images', 'stream', 'tools', 'v1']);
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._~:-]{1,160}$/;

// 从环境变量读取上游请求超时时间并限制在安全范围内
function getRequestTimeoutMs(): number {
  const configured = Number(process.env.AGENT_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(configured)));
}

// 创建统一JSON错误响应
function createErrorResponse(message: string, status: number, code: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

// 将前端代理路径映射到Agent公开接口路径
function mapAgentPath(pathSegments: string[]): string | null {
  if (pathSegments.length === 0 || !ALLOWED_ROOT_SEGMENTS.has(pathSegments[0])) return null;
  if (pathSegments.some((segment) => !PATH_SEGMENT_PATTERN.test(segment))) return null;
  const encodedSegments = pathSegments.map((segment) => encodeURIComponent(segment));
  if (encodedSegments[0] === 'v1') return `/api/${encodedSegments.join('/')}`;
  return `/${encodedSegments.join('/')}`;
}

// 根据配置和入站查询参数构造固定Agent上游地址
function createUpstreamUrl(pathname: string, requestUrl: string): URL | null {
  const baseUrl = process.env.AGENT_API_BASE_URL?.trim();
  if (!baseUrl) return null;

  try {
    const upstreamUrl = new URL(baseUrl);
    if (upstreamUrl.protocol !== 'http:' && upstreamUrl.protocol !== 'https:') return null;
    upstreamUrl.pathname = pathname;
    upstreamUrl.search = new URL(requestUrl).search;
    upstreamUrl.hash = '';
    return upstreamUrl;
  } catch {
    return null;
  }
}

// 复制允许透传的请求头，避免向Agent泄露浏览器凭据
function createUpstreamHeaders(request: Request): Headers {
  const headers = new Headers({
    Accept: request.headers.get('accept') ?? 'application/json, text/event-stream',
    'X-Request-Id': crypto.randomUUID(),
  });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  return headers;
}

// 复制响应展示所需的安全头并禁用代理缓存
function createDownstreamHeaders(upstream: Response): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of ['content-disposition', 'content-type']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (upstream.headers.get('content-type')?.includes('text/event-stream')) {
    headers.set('X-Accel-Buffering', 'no');
  }
  return headers;
}

// 判断网络异常是否由请求超时或中止引起
function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = error.cause && typeof error.cause === 'object' ? (error.cause as { code?: unknown }) : undefined;
  return (
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    cause?.code === 'ETIMEDOUT'
  );
}

// 统一代理Agent全部公开接口并保留JSON、SSE和文件上传语义
export async function proxyAgentRequest(
  request: Request,
  pathSegments: string[],
  upstreamFetch: typeof fetch = fetch,
): Promise<Response> {
  const pathname = mapAgentPath(pathSegments);
  if (!pathname) return createErrorResponse('Agent接口路径不正确。', 400, 'INVALID_REQUEST');

  const upstreamUrl = createUpstreamUrl(pathname, request.url);
  if (!upstreamUrl) return createErrorResponse('AI助手服务配置异常，请联系管理员。', 500, 'CONFIG_ERROR');

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      const requestBody = await request.arrayBuffer();
      body = requestBody.byteLength > 0 ? requestBody : undefined;
    } catch {
      return createErrorResponse('请求体格式不正确。', 400, 'INVALID_REQUEST');
    }
  }

  try {
    const upstream = await upstreamFetch(upstreamUrl, {
      method: request.method,
      headers: createUpstreamHeaders(request),
      body,
      signal: AbortSignal.timeout(getRequestTimeoutMs()),
      cache: 'no-store',
    });
    const responseBody = upstream.status === 204 || upstream.status === 304 ? null : upstream.body;
    return new Response(responseBody, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: createDownstreamHeaders(upstream),
    });
  } catch (error) {
    console.error('Agent upstream request failed', {
      event: 'agent_upstream_fetch_failed',
      pathname,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return isTimeoutError(error)
      ? createErrorResponse('AI助手响应超时，请稍后重试。', 504, 'AGENT_TIMEOUT')
      : createErrorResponse('AI助手网络连接失败，请稍后重试。', 503, 'UPSTREAM_UNAVAILABLE');
  }
}
