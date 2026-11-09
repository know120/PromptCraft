import { describe, expect, it } from "vitest"
import { analyzePrompt } from "@promptcraft/core"
import { buildCodexPrompt, buildCodexReviewPrompt, reviewWithCodex } from "@promptcraft/codex"

describe("buildCodexPrompt", () => {
  it("builds a Codex task prompt from an analysis", () => {
    const analysis = analyzePrompt("fix the login thing, it's broken, maybe improve it somehow")
    const prompt = buildCodexPrompt(analysis)
    expect(prompt).toContain("## Task")
    expect(prompt).toContain("Fix the login thing, it's broken, improve it somehow")
  })

  it("includes context when findings demand it", () => {
    const analysis = analyzePrompt("Add rate limiting to src/api/login.ts")
    const prompt = buildCodexPrompt(analysis)
    expect(prompt).toContain("Context")
  })
})

describe("buildCodexReviewPrompt", () => {
  it("embeds heuristics and asks for JSON", () => {
    const analysis = analyzePrompt("fix the login thing, it's broken, maybe improve it somehow")
    const prompt = buildCodexReviewPrompt("fix the login thing", analysis)
    expect(prompt).toContain("You are Codex reviewing")
    expect(prompt).toContain('"rewrittenPrompt"')
  })
})

describe("reviewWithCodex", () => {
  it("runs the shared analysis", async () => {
    const analysis = await reviewWithCodex("fix the login thing, it's broken, maybe improve it somehow")
    expect(analysis.score).toBeLessThan(50)
  })
})
