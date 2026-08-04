import { lookup } from 'node:dns/promises';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';

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

// 将IPv4地址字符串拆分为数字数组
function getIpv4Octets(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  return address.split('.').map(Number);
}

// 解析IPv6地址字符串为16位分组数字数组
function parseIpv6(address: string): number[] | null {
  const segments = address.toLowerCase().split('::');
  if (segments.length > 2) return null;

  const head = segments[0] ? segments[0].split(':') : [];
  const tail = segments[1] ? segments[1].split(':') : [];
  const groups = [...head, ...tail];
  const lastGroup = groups.at(-1);

  if (lastGroup?.includes('.')) {
    const octets = getIpv4Octets(lastGroup);
    if (!octets) return null;
    groups.splice(-1, 1, `${(octets[0] << 8) | octets[1]}`, `${(octets[2] << 8) | octets[3]}`);
  }

  if (groups.length > 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  if (segments.length === 1 && groups.length !== 8) return null;

  const missingGroups = 8 - groups.length;
  const headLength = head.length;
  return [
    ...groups.slice(0, headLength).map((group) => Number.parseInt(group, 16)),
    ...Array(missingGroups).fill(0),
    ...groups.slice(headLength).map((group) => Number.parseInt(group, 16)),
  ];
}

// 判断地址是否为私有网络地址（IPv4/IPv6）
function isPrivateAddress(address: string): boolean {
  const octets = getIpv4Octets(address);
  if (octets) {
    const [a, b] = octets;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }

  const groups = parseIpv6(address);
  if (!groups) return true;

  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const isLinkLocal = (groups[0] & 0xffc0) === 0xfe80;
  const isUniqueLocal = (groups[0] & 0xfe00) === 0xfc00;
  const isDeprecatedSiteLocal = (groups[0] & 0xffc0) === 0xfec0;
  const isEmbeddedIpv4 = groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0 || groups[5] === 0xffff);

  if (isEmbeddedIpv4) {
    const embeddedIpv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isPrivateAddress(embeddedIpv4);
  }

  return isUnspecified || isLoopback || isLinkLocal || isUniqueLocal || isDeprecatedSiteLocal;
}

// 判断地址是否为受控的198.18.0.0/15出口中继地址
function isControlledEgressRelay(address: string): boolean {
  const octets = getIpv4Octets(address);
  return octets?.[0] === 198 && (octets[1] === 18 || octets[1] === 19);
}

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
  // Managed runtimes can resolve public hosts through a 198.18.0.0/15 egress relay.
  // Permit that relay only for DNS-resolved hostnames; literal URLs in this range remain blocked above.
  const record = records.find(
    (candidate) => !isPrivateAddress(candidate.address) || isControlledEgressRelay(candidate.address),
  );
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
    return new NextResponse(body, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
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
