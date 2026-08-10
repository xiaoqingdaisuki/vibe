import { lookup } from 'node:dns/promises';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { isPrivateAddress, selectPublicAddress } from '@/features/apps/rss/server-address';

export const runtime = 'nodejs';

const MAX_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 15_000;

interface ValidatedTarget {
  url: URL;
  hostname: string;
  address: string;
  family: 4 | 6;
}

class TargetValidationError extends Error {}

// 校验并解析RSS目标URL，确保仅允许HTTP/HTTPS且非私有地址
async function validateTarget(value: string): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TargetValidationError('仅支持 HTTP 或 HTTPS RSS 地址');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new TargetValidationError('仅支持 HTTP 或 HTTPS RSS 地址');
  if (
    url.username ||
    url.password ||
    url.port ||
    hostname === 'localhost' ||
    (isIP(hostname) !== 0 && isPrivateAddress(hostname))
  )
    throw new TargetValidationError('不允许访问该地址');

  const records = await lookup(hostname, { all: true });
  const record = selectPublicAddress(records);
  if (!record) {
    throw new TargetValidationError('不允许访问私有网络地址');
  }
  if (record.family !== 4 && record.family !== 6) throw new TargetValidationError('不允许访问该地址');

  return { url, hostname, address: record.address, family: record.family };
}

// 向验证通过的RSS地址发起HTTP/HTTPS请求
function requestTarget(target: ValidatedTarget): Promise<IncomingMessage> {
  const client = target.url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        hostname: target.hostname,
        method: 'GET',
        path: `${target.url.pathname}${target.url.search}`,
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
        lookup(_hostname, options, callback) {
          if (options.all) {
            callback(null, [{ address: target.address, family: target.family }]);
            return;
          }
          callback(null, target.address, target.family);
        },
      },
      resolve,
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('RSS request timed out')));
    request.on('error', reject);
    request.end();
  });
}

// 读取HTTP响应体内容，限制最大字节数防止内存溢出
async function readBody(response: IncomingMessage): Promise<string> {
  const contentLength = response.headers['content-length'];
  const length = Number(Array.isArray(contentLength) ? contentLength[0] : (contentLength ?? 0));
  if (length > MAX_BYTES) throw new Error('RSS 内容过大');

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of response) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_BYTES) throw new Error('RSS 内容过大');
    chunks.push(bytes);
  }

  return Buffer.concat(chunks, size).toString('utf-8');
}

// RSS代理GET端点，获取并转发RSS订阅内容
export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('url');
  if (!target) return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
  try {
    const validatedTarget = await validateTarget(target);
    const response = await requestTarget(validatedTarget);
    const status = response.statusCode ?? 502;
    if (status >= 300 && status < 400) {
      response.resume();
      return NextResponse.json({ error: '不支持 RSS 重定向' }, { status: 400 });
    }
    if (status < 200 || status >= 300) {
      response.resume();
      return NextResponse.json({ error: `请求失败 (${status})` }, { status });
    }
    const body = await readBody(response);
    if (!body.trim()) return NextResponse.json({ error: '目标站点返回空内容' }, { status: 502 });
    return new NextResponse(body, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="feed.xml"',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: unknown) {
    const message =
      (error instanceof Error && error.message.startsWith('仅支持')) ||
      (error instanceof Error && error.message.startsWith('不允许')) ||
      (error instanceof Error && error.message === 'RSS 内容过大')
        ? error.message
        : '获取 RSS 失败';
    return NextResponse.json({ error: message }, { status: error instanceof TargetValidationError ? 400 : 502 });
  }
}
