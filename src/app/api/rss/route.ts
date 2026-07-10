import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get("url")
  if (!targetUrl) {
    return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 })
  }

  try {
    const res = await fetch(targetUrl, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `请求失败 (${res.status})` },
        { status: res.status },
      )
    }

    const text = await res.text()
    if (!text.trim()) {
      return NextResponse.json(
        { error: "目标站点返回空内容，可能已屏蔽服务端请求" },
        { status: 502 },
      )
    }

    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    })
  } catch (err: unknown) {
    const message =
      err instanceof DOMException && err.name === "TimeoutError"
        ? "请求超时"
        : err instanceof Error
          ? err.message
          : "获取RSS失败"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
