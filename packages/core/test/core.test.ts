import { describe, expect, it } from "vitest"
import {
  analyze,
  analyzePrompt,
  extractFeatures,
  formatReport,
  normalizeAsk,
  parseLlmReview,
  type LlmProvider,
} from "@promptcraft/core"

const GOOD_PROMPT = [
  "Add rate limiting to `src/api/login.ts`. After 5 failed attempts from the same IP within 10 minutes, return HTTP 429 with a `Retry-After` header.",
  "",
  "Acceptance criteria:",
  "- [ ] The 6th attempt within the window returns 429",
  "- [ ] The counter resets after 10 minutes",
  "- [ ] `npm test` passes",
  "",
  "Do not change the response body for successful logins.",
].join("\n")

const BAD_PROMPT = "fix the login thing, it's broken, maybe improve it somehow"

const BUG_PROMPT = [
  "Fix `src/auth/session.ts`: `refreshToken()` returns undefined after the token expires.",
  "",
  "Error:",
  "```",
  "TypeError: Cannot read properties of undefined (reading 'exp')",
  "    at refreshToken (src/auth/session.ts:42:18)",
  "```",
  "",
  "Expected: refreshToken returns a new token. Actual: it returns undefined.",
  "",
  "Done when `npm test` passes.",
].join("\n")

function fakeProvider(text: string, onCall?: () => void): LlmProvider {
  return {
    name: "fake",
    async complete() {
      onCall?.()
      return text
    },
  }
}

describe("extractFeatures", () => {
  it("finds file paths with and without directories", () => {
    const features = extractFeatures("Please fix `src/auth/login.ts` and also login.py")
    expect(features.filePaths).toContain("src/auth/login.ts")
    expect(features.filePaths).toContain("login.py")
    expect(features.hasFilePath).toBe(true)
  })

  it("recognises pasted error output", () => {
    const features = extractFeatures(
      "TypeError: bad call\n    at run (src/a.ts:1:2)",
    )
    expect(features.hasErrorOutput).toBe(true)
  })

  it("needs both current and expected behaviour before calling them stated", () => {
    expect(extractFeatures("it's broken").hasCurrentVsExpected).toBe(false)
    expect(
      extractFeatures("It returns undefined; it should return a token").hasCurrentVsExpected,
    ).toBe(true)
    expect(extractFeatures(BUG_PROMPT).hasCurrentVsExpected).toBe(true)
  })

  it("detects a bug report and its missing pieces", () => {
    const features = extractFeatures(BAD_PROMPT)
    expect(features.taskTypes).toContain("bug")
    expect(features.ambiguousReferences.length).toBeGreaterThan(0)
    expect(features.hedgeTerms).toContain("maybe")
  })
})

describe("analyzePrompt", () => {
  it("rewards a prompt with context, criteria, and constraints", () => {
    const result = analyzePrompt(GOOD_PROMPT)
    expect(result.score).toBeGreaterThanOrEqual(90)
    expect(result.grade).toBe("A")
    expect(result.findings.map((finding) => finding.ruleId)).not.toContain(
      "no-acceptance",
    )
  })

  it("flags the obvious mistakes in a vague prompt", () => {
    const result = analyzePrompt(BAD_PROMPT)
    const ids = result.findings.map((finding) => finding.ruleId)

    expect(result.score).toBeLessThan(40)
    expect(result.grade).toBe("F")
    expect(ids).toContain("vague-task")
    expect(ids).toContain("ambiguous-reference")
    expect(ids).toContain("no-error-details")
    expect(ids).toContain("no-current-vs-expected")
    expect(ids).toContain("no-acceptance")
    expect(ids).toContain("no-verification")
  })

  it("does not demand an error paste when one is included", () => {
    const result = analyzePrompt(BUG_PROMPT)
    const ids = result.findings.map((finding) => finding.ruleId)

    expect(ids).not.toContain("no-error-details")
    expect(ids).not.toContain("no-context")
    expect(ids).not.toContain("no-acceptance")
    expect(result.score).toBeGreaterThan(70)
  })

  it("detects several jobs packed into one sentence", () => {
    const result = analyzePrompt(
      "Add a dark mode toggle, fix the broken login form, refactor the settings page, and update the docs.",
    )
    expect(result.findings.map((finding) => finding.ruleId)).toContain("multi-task")
  })

  it("returns a grade F for an empty prompt", () => {
    const result = analyzePrompt("   ")
    expect(result.score).toBe(0)
    expect(result.findings[0]?.ruleId).toBe("empty-prompt")
  })

  it("sorts findings by weight", () => {
    const weights = analyzePrompt(BAD_PROMPT).findings.map(
      (finding) => finding.weight,
    )
    const sorted = [...weights].sort((a, b) => b - a)
    expect(weights).toEqual(sorted)
  })
})

describe("improved prompt", () => {
  it("adds the sections the original prompt is missing", () => {
    const result = analyzePrompt(BAD_PROMPT)
    expect(result.improvedPrompt).toContain("## Task")
    expect(result.improvedPrompt).toContain("## Context")
    expect(result.improvedPrompt).toContain("## Done when")
    expect(result.improvedPrompt).toContain("ask before making changes")
  })

  it("strips pleasantries and hedges from the ask", () => {
    expect(normalizeAsk("Could you please maybe improve the login flow, thanks")).toBe(
      "Improve the login flow",
    )
  })
})

describe("formatReport", () => {
  it("renders score, findings, and the scaffold", () => {
    const report = formatReport(analyzePrompt(BAD_PROMPT))
    expect(report).toContain("## PromptCraft")
    expect(report).toContain("/100 (F)")
    expect(report).toContain("### What to fix")
    expect(report).toContain("### Prompt scaffold")
  })

  it("mentions the model rewrite when one exists", async () => {
    const result = await analyze(BAD_PROMPT, {
      llm: fakeProvider(
        JSON.stringify({
          summary: "The ask is too vague.",
          issues: [],
          rewrittenPrompt: "Rewrite the login handler to reject expired tokens.",
        }),
      ),
      llmMode: "always",
    })
    expect(formatReport(result)).toContain("model rewrite")
    expect(formatReport(result)).toContain("reject expired tokens")
  })
})

describe("LLM review", () => {
  it("parses fenced JSON", () => {
    const review = parseLlmReview(
      'Here you go:\n```json\n{"summary":"ok","issues":[{"title":"t","detail":"d","fix":"f","severity":"error"}]}\n```',
    )
    expect(review.summary).toBe("ok")
    expect(review.issues[0]).toMatchObject({ title: "t", severity: "error" })
  })

  it("rejects a response with no JSON", () => {
    expect(() => parseLlmReview("no idea")).toThrow(/JSON/)
  })

  it("skips the model when auto mode sees a strong prompt", async () => {
    let called = false
    const result = await analyze(GOOD_PROMPT, {
      llm: fakeProvider("{}", () => {
        called = true
      }),
      llmMode: "auto",
    })
    expect(called).toBe(false)
    expect(result.llm).toBeUndefined()
  })

  it("keeps the heuristic result when the model fails", async () => {
    const result = await analyze(BAD_PROMPT, {
      llm: {
        name: "broken",
        async complete() {
          throw new Error("provider is down")
        },
      },
      llmMode: "always",
    })
    expect(result.llmError).toContain("provider is down")
    expect(result.score).toBeGreaterThan(0)
    expect(result.findings.length).toBeGreaterThan(0)
  })
})
