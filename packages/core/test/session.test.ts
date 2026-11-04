import { describe, expect, it } from "vitest"
import {
  analyzeSession,
  analyzeSessionPrompts,
  computeScoreTrend,
  formatSessionReport,
  parseSessionLlmReview,
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

const VAGUE_PROMPT_1 = "fix the login thing, it's broken, maybe improve it somehow"
const VAGUE_PROMPT_2 = "fix the signup form, it doesn't work, maybe make it better"

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

describe("computeScoreTrend", () => {
  it("returns insufficient_data for < 2 scores", () => {
    expect(computeScoreTrend([])).toBe("insufficient_data")
    expect(computeScoreTrend([80])).toBe("insufficient_data")
  })

  it("detects trend for two scores", () => {
    expect(computeScoreTrend([50, 70])).toBe("improving")
    expect(computeScoreTrend([80, 60])).toBe("declining")
    expect(computeScoreTrend([70, 72])).toBe("steady")
  })

  it("detects trend for multi-turn sessions", () => {
    expect(computeScoreTrend([40, 50, 75, 90])).toBe("improving")
    expect(computeScoreTrend([90, 85, 45, 30])).toBe("declining")
    expect(computeScoreTrend([75, 76, 74, 75])).toBe("steady")
  })
})

describe("analyzeSessionPrompts", () => {
  it("handles empty or blank prompt lists", () => {
    const emptyResult = analyzeSessionPrompts([])
    expect(emptyResult.totalPrompts).toBe(0)
    expect(emptyResult.averageScore).toBe(0)
    expect(emptyResult.grade).toBe("F")
    expect(emptyResult.scoreTrend).toBe("insufficient_data")
    expect(emptyResult.bestPrompt).toBeUndefined()

    const whitespaceResult = analyzeSessionPrompts(["   ", "\n\t"])
    expect(whitespaceResult.totalPrompts).toBe(0)
  })

  it("supports string arrays and SessionPromptItem objects", () => {
    const result = analyzeSessionPrompts([
      VAGUE_PROMPT_1,
      { text: GOOD_PROMPT, timestamp: 1700000000, id: "msg-2" },
    ])
    expect(result.totalPrompts).toBe(2)
    expect(result.prompts[0]?.prompt).toBe(VAGUE_PROMPT_1)
    expect(result.prompts[1]?.prompt).toBe(GOOD_PROMPT)
    expect(result.prompts[1]?.id).toBe("msg-2")
    expect(result.prompts[1]?.timestamp).toBe(1700000000)
  })

  it("analyzes single prompt session without recurring errors requiring 2+ occurrences", () => {
    const result = analyzeSessionPrompts([VAGUE_PROMPT_1])
    expect(result.totalPrompts).toBe(1)
    expect(result.averageScore).toBeLessThan(40)
    expect(result.scoreTrend).toBe("insufficient_data")
    expect(result.bestPrompt?.index).toBe(1)
    expect(result.worstPrompt?.index).toBe(1)
    // For single prompt, recurring issues captures the prompt's issues
    expect(result.recurringIssues.length).toBeGreaterThan(0)
    expect(result.recurringIssues[0]?.percentage).toBe(100)
  })

  it("identifies recurring issues across multiple prompts", () => {
    const result = analyzeSessionPrompts([VAGUE_PROMPT_1, VAGUE_PROMPT_2, GOOD_PROMPT])
    expect(result.totalPrompts).toBe(3)
    expect(result.scoreHistory.length).toBe(3)

    // Vague prompt 1 & 2 share several issues (e.g. no-acceptance, vague-task, etc.)
    const recurringIds = result.recurringIssues.map((r) => r.ruleId)
    expect(recurringIds).toContain("vague-task")
    expect(recurringIds).toContain("no-acceptance")

    const vagueTask = result.recurringIssues.find((r) => r.ruleId === "vague-task")
    expect(vagueTask?.count).toBe(2)
    expect(vagueTask?.percentage).toBe(67) // 2 / 3 = ~67%

    // Best prompt is GOOD_PROMPT (index 3)
    expect(result.bestPrompt?.index).toBe(3)
    expect(result.bestPrompt?.analysis.grade).toBe("A")
  })

  it("computes common strengths across prompts", () => {
    const result = analyzeSessionPrompts([GOOD_PROMPT, BUG_PROMPT])
    expect(result.commonStrengths.length).toBeGreaterThan(0)
  })
})

describe("formatSessionReport", () => {
  it("formats empty session report", () => {
    const report = formatSessionReport(analyzeSessionPrompts([]))
    expect(report).toContain("## PromptCraft — Session Analysis")
    expect(report).toContain("No user prompts were found in this session.")
  })

  it("formats rich session report with overview, recurring habits, and breakdown", () => {
    const analysis = analyzeSessionPrompts([VAGUE_PROMPT_1, VAGUE_PROMPT_2, GOOD_PROMPT])
    const report = formatSessionReport(analysis, {
      footer: "Run `/prompt-session` anytime during your session.",
    })

    expect(report).toContain("## PromptCraft — Session Analysis ·")
    expect(report).toContain("### Overview · 3 prompts analyzed")
    expect(report).toContain("Score trend:")
    expect(report).toContain("Highest scoring prompt:")
    expect(report).toContain("Prompt needing most attention:")
    expect(report).toContain("### Recurring habits across session")
    expect(report).toContain("### Prompt breakdown")
    expect(report).toContain("**#1.")
    expect(report).toContain("**#2.")
    expect(report).toContain("**#3.")
    expect(report).toContain("Run `/prompt-session` anytime during your session.")
  })

  it("respects showPromptBreakdown: false", () => {
    const analysis = analyzeSessionPrompts([VAGUE_PROMPT_1, GOOD_PROMPT])
    const report = formatSessionReport(analysis, { showPromptBreakdown: false })
    expect(report).not.toContain("### Prompt breakdown")
  })
})

describe("LLM session review", () => {
  it("parses session LLM review JSON", () => {
    const raw = JSON.stringify({
      summary: "Communication improved as the session progressed.",
      patterns: ["Initial prompts lacked reproduction details."],
      recommendations: ["Include unit test commands in first turn."],
    })
    const parsed = parseSessionLlmReview(raw)
    expect(parsed.summary).toContain("Communication improved")
    expect(parsed.patterns).toHaveLength(1)
    expect(parsed.recommendations).toHaveLength(1)
  })

  it("skips model when auto mode sees strong average score", async () => {
    let called = false
    const result = await analyzeSession([GOOD_PROMPT, GOOD_PROMPT], {
      llm: fakeProvider("{}", () => {
        called = true
      }),
      llmMode: "auto",
    })
    expect(called).toBe(false)
    expect(result.llm).toBeUndefined()
  })

  it("invokes model when configured and low score", async () => {
    let called = false
    const result = await analyzeSession([VAGUE_PROMPT_1, VAGUE_PROMPT_2], {
      llm: fakeProvider(
        JSON.stringify({
          summary: "Prompts were consistently vague and lacked detail.",
          patterns: ["Hedge words and vague verbs used repeatedly."],
          recommendations: ["Specify files and exact acceptance tests."],
        }),
        () => {
          called = true
        },
      ),
      llmMode: "auto",
    })
    expect(called).toBe(true)
    expect(result.llm?.summary).toContain("consistently vague")
    expect(result.llm?.patterns?.[0]).toContain("Hedge words")
  })

  it("gracefully catches provider errors without losing heuristic session report", async () => {
    const result = await analyzeSession([VAGUE_PROMPT_1, VAGUE_PROMPT_2], {
      llm: {
        name: "failing-provider",
        async complete() {
          throw new Error("API quota exceeded")
        },
      },
      llmMode: "always",
    })
    expect(result.llmError).toContain("API quota exceeded")
    expect(result.totalPrompts).toBe(2)
    expect(result.recurringIssues.length).toBeGreaterThan(0)

    const report = formatSessionReport(result)
    expect(report).toContain("Model session review unavailable: API quota exceeded")
  })
})
