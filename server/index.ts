import { handleRequest } from "./lib/handle-request"

const server = Bun.serve({
  port: Number(process.env.BUN_SERVER_PORT ?? 4000),
  fetch: async (request) => {
    const url = new URL(request.url)

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders })
    }

    const response = await handleRequest(request)
    const newHeaders = new Headers(response.headers)
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value)
    })
    return new Response(response.body, { status: response.status, headers: newHeaders })
  },
})

console.log(`Bun server running at http://localhost:${server.port}`)
