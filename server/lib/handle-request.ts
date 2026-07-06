type FetchLike = typeof fetch

export async function handleRequest(
  request: Request,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === "/health") {
    return Response.json({
      ok: true,
      runtime: "bun",
      timestamp: new Date().toISOString(),
    })
  }

  if (url.pathname === "/api/public/example") {
    try {
      const response = await fetchImpl("https://api.github.com/repos/oven-sh/bun")
      if (!response.ok) {
        throw new Error(`Upstream responded with ${response.status}`)
      }

      const data = (await response.json()) as unknown

      return Response.json({
        source: "github-public-api",
        data,
      })
    } catch {
      return Response.json(
        {
          error: "Failed to fetch from upstream",
        },
        { status: 502 },
      )
    }
  }

  return Response.json(
    {
      error: "Not Found",
      message: "The requested resource does not exist.",
    },
    {
      status: 404,
    },
  )
}
