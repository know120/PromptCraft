import { describe, expect, it } from "vitest"
import {
  appendPrompt,
  isPromptCraftCommand,
  isSessionReview,
  isSessionSentinel,
  mergePrompts,
  type StoredPrompt,
} from "../src/prompt-log.js"

const prompt = (id: string, text: string, createdAt = 0): StoredPrompt => ({
  id,
  text,
  createdAt,
})

describe("isSessionReview", () => {
  it("accepts every session-review spelling", () => {
    for (const value of ["all", "ALL", "all the prompts", "--all", "-a", "session", "--session", "-s"]) {
      expect(isSessionReview(value), value).toBe(true)
    }
  })

  it("does not treat ordinary prompts as session reviews", () => {
    for (const value of ["allow this", "sessionwide", "fix the login flow", "", "--apply"]) {
      expect(isSessionReview(value), value).toBe(false)
    }
  })
})

describe("isSessionSentinel", () => {
  it("matches a bare argument only", () => {
    expect(isSessionSentinel("--all")).toBe(true)
    expect(isSessionSentinel("all")).toBe(true)
    expect(isSessionSentinel("all the prompts")).toBe(false)
  })
})

describe("isPromptCraftCommand", () => {
  it("matches the plugin's own slash commands", () => {
    expect(isPromptCraftCommand("/prompt-review all", ["prompt-review"])).toBe(true)
    expect(isPromptCraftCommand("/prompt-apply", ["prompt-apply"])).toBe(true)
    expect(isPromptCraftCommand("/prompt-reviewer", ["prompt-review"])).toBe(false)
    expect(isPromptCraftCommand("review this", ["prompt-review"])).toBe(false)
  })
})

describe("appendPrompt", () => {
  it("trims, dedupes by message ID, and keeps the newest entries", () => {
    const first = appendPrompt([], prompt("m1", "  first  "))
    expect(first).toEqual([prompt("m1", "first")])

    expect(appendPrompt(first, prompt("m1", "first again"))).toBe(first)

    const capped = appendPrompt(first, prompt("m2", "second"), 1)
    expect(capped).toEqual([prompt("m2", "second")])
  })

  it("ignores empty prompts", () => {
    const prompts = [prompt("m1", "first")]
    expect(appendPrompt(prompts, prompt("m2", "   "))).toBe(prompts)
  })
})

describe("mergePrompts", () => {
  it("merges the durable log with the compacted context", () => {
    const merged = mergePrompts(
      [prompt("m1", "old prompt", 1)],
      [
        { id: "m1", type: "user", text: "old prompt", time: { created: 1 } },
        { id: "m2", type: "user", text: "new prompt", time: { created: 2 } },
        { id: "a1", type: "assistant", text: "answer" },
      ],
    )

    expect(merged).toEqual([
      prompt("m1", "old prompt", 1),
      prompt("m2", "new prompt", 2),
    ])
  })

  it("skips command invocations and bare sentinels", () => {
    const skipText = (text: string) => isSessionSentinel(text)
    const merged = mergePrompts(
      [],
      [
        { id: "m1", type: "user", text: "all" },
        { id: "m2", type: "user", text: "/prompt-review all" },
        { id: "m3", type: "user", text: "fix the bug" },
      ],
      { skipText: (text) => skipText(text) || text.startsWith("/prompt-") },
    )

    expect(merged).toEqual([prompt("m3", "fix the bug", 0)])
  })
})
