import assert from "node:assert/strict"
import test from "node:test"
import eslintConfig from "./eslint.config.mjs"

test("eslint flat config does not use legacy extends entries", () => {
  assert.ok(Array.isArray(eslintConfig))
  assert.equal(
    eslintConfig.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "extends" in entry,
    ),
    false,
  )
})
