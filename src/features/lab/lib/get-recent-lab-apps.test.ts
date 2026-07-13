import assert from "node:assert/strict"
import test from "node:test"
import { getRecentLabApps } from "./get-recent-lab-apps.ts"

const testApps = [
  { slug: "fourth", title: "Fourth", description: "", category: "app" as const, tags: [], href: "/fourth", recentOrder: 4 },
  { slug: "unmarked", title: "Unmarked", description: "", category: "app" as const, tags: [], href: "/unmarked" },
  { slug: "second", title: "Second", description: "", category: "app" as const, tags: [], href: "/second", recentOrder: 2 },
  { slug: "first", title: "First", description: "", category: "app" as const, tags: [], href: "/first", recentOrder: 1 },
  { slug: "third", title: "Third", description: "", category: "app" as const, tags: [], href: "/third", recentOrder: 3 },
]

test("getRecentLabApps returns manually ordered apps and limits the result to three", () => {
  assert.deepEqual(
    getRecentLabApps().map((app) => app.slug),
    ["rss", "rpg", "skills"],
  )
})

test("getRecentLabApps excludes unmarked apps and limits manually ordered apps to three", () => {
  assert.deepEqual(
    getRecentLabApps(testApps).map((app) => app.slug),
    ["first", "second", "third"],
  )
})
