import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const MAX_BYTES = 1_000_000

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number)
    return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  const normalized = address.toLowerCase()
  return normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")
}

async function validateTarget(value: string): Promise<URL> {
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("仅支持 HTTP 或 HTTPS RSS 地址")
  if (url.username || url.password || url.port || url.hostname === "localhost") throw new Error("不允许访问该地址")
  const records = await lookup(url.hostname, { all: true })
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) throw new Error("不允许访问私有网络地址")
  return url
}

async function readBody(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0)
  if (length > MAX_BYTES) throw new Error("RSS 内容过大")
  const reader = response.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) throw new Error("RSS 内容过大")
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url")
  if (!target) return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 })
  try {
    const url = await validateTarget(target)
    const response = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" }, redirect: "manual", signal: AbortSignal.timeout(15_000) })
    if (response.status >= 300 && response.status < 400) return NextResponse.json({ error: "不支持 RSS 重定向" }, { status: 400 })
    if (!response.ok) return NextResponse.json({ error: `请求失败 (${response.status})` }, { status: response.status })
    const body = await readBody(response)
    if (!body.trim()) return NextResponse.json({ error: "目标站点返回空内容" }, { status: 502 })
    return new NextResponse(body, { headers: { "Content-Type": "text/xml; charset=utf-8" } })
  } catch (error: unknown) {
    const message = error instanceof Error && error.message.startsWith("仅支持") || error instanceof Error && error.message.startsWith("不允许") || error instanceof Error && error.message === "RSS 内容过大" ? error.message : "获取 RSS 失败"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
