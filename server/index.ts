import { handleRequest } from "./lib/handle-request"

const server = Bun.serve({
  port: Number(process.env.BUN_SERVER_PORT ?? 4000),
  fetch: handleRequest,
})

console.log(`Bun auxiliary server running at http://localhost:${server.port}`)
