import type { Analysis, LlmProvider, LlmReview, Severity } from "./types.js"

const SYSTEM_PROMPT = `You are PromptCraft, a reviewer for prompts sent to coding agents such as OpenCode, Codex, and Claude Code.

Your job is to find what will make the agent misunderstand, overreach, or stop too early. Judge the prompt as an instruction to an autonomous coding agent, not as a question to a chatbot.

Rules:
- Be concrete. Quote the user's own words when useful.
- Do not invent file names, versions, or facts that are not in the prompt.
- Do not repeat the heuristic findings unless you add meaningful detail.
- At most 5 issues, ordered by impact.
- A good prompt names the goal, the code it touches, the constraints, and how success is checked.
- Preserve the user's intent in the rewrite. Do not add requirements they did not imply.

Return ONLY valid JSON:
{
  "summary": "one or two sentences",
  "issues": [
    { "title": "short name", "detail": "why it matters here", "fix": "what to write instead", "severity": "error" | "warn" | "info" }
  ],
  "rewrittenPrompt": "a complete prompt the user can send as-is"
}`

export interface ReviewPromptInput {
  prompt: string
  analysis: Analysis
  provider: LlmProvider
  signal?: AbortSignal
  maxTokens?: number
}

export async function reviewPrompt(input: ReviewPromptInput): Promise<LlmReview> {
  const { analysis, provider } = input
  const heuristics =
    analysis.findings
      .map((finding) => `- [${finding.severity}] ${finding.title}: ${finding.detail}`)
      .join("\n") || "- (none)"

  const userPrompt = [
    "Review this prompt for a coding agent.",
    "",
    "Prompt:",
    "```text",
    input.prompt,
    "```",
    "",
    `Heuristic review scored it ${analysis.score}/100 and found:`,
    heuristics,
    "",
    `Detected task types: ${analysis.features.taskTypes.join(", ")}`,
    "",
    "Add only what the heuristic review missed, or sharpen its conclusions. Return JSON only.",
  ].join("\n")

  const raw = await provider.complete({
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    maxTokens: input.maxTokens ?? 1200,
    signal: input.signal,
  })

  return parseLlmReview(raw)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback
}

function asSeverity(value: unknown): Severity {
  return value === "error" || value === "warn" || value === "info" ? value : "warn"
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? raw
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end <= start) {
    throw new Error("model response did not contain a JSON object")
  }
  return candidate.slice(start, end + 1)
}

export function parseLlmReview(raw: string): LlmReview {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`could not parse model review: ${message}`)
  }

  if (!isRecord(parsed)) {
    throw new Error("could not parse model review: expected a JSON object")
  }

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues
        .filter(isRecord)
        .slice(0, 6)
        .map((issue) => ({
          title: asString(issue.title, "Untitled issue"),
          detail: asString(issue.detail),
          fix: asString(issue.fix),
          severity: asSeverity(issue.severity),
        }))
        .filter((issue) => issue.detail.length > 0)
    : []

  const summary = asString(parsed.summary)
  if (!summary && issues.length === 0) {
    throw new Error("could not parse model review: response was empty")
  }

  const rewrittenPrompt = asString(parsed.rewrittenPrompt)
  return {
    summary: summary || "The model did not return a summary.",
    issues,
    ...(rewrittenPrompt ? { rewrittenPrompt } : {}),
  }
}
