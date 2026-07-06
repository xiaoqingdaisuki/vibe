import assert from "node:assert/strict"
import test from "node:test"
import { handleRequest } from "./handle-request.ts"

test("handleRequest returns health status", async () => {
  const response = await handleRequest(new Request("http://localhost/health"))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.runtime, "bun")
})

test("handleRequest returns upstream payload for the public example route", async () => {
  const response = await handleRequest(
    new Request("http://localhost/api/public/example"),
    async () =>
      Response.json({
        full_name: "oven-sh/bun",
      }),
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.source, "github-public-api")
  assert.deepEqual(payload.data, { full_name: "oven-sh/bun" })
})

test("handleRequest returns 502 when the upstream response is not ok", async () => {
  const response = await handleRequest(
    new Request("http://localhost/api/public/example"),
    async () =>
      Response.json(
        {
          message: "rate limited",
        },
        { status: 403 },
      ),
  )
  const payload = await response.json()

  assert.equal(response.status, 502)
  assert.equal(payload.error, "Failed to fetch from upstream")
})
