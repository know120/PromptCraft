import type {
  Analysis,
  LlmProvider,
  LlmReview,
  SessionAnalysis,
  SessionLlmReview,
  Severity,
} from "./types.js"

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

const SESSION_SYSTEM_PROMPT = `You are PromptCraft, an expert prompt reviewer and coach for developers working with coding agents (such as OpenCode, Codex, and Claude Code).

Your job is to analyze all the prompts a user sent during an interactive session. Evaluate communication clarity, recurring weaknesses or blindspots, and how well the user guides the agent.

Rules:
- Be concrete, concise, and constructive.
- Identify real patterns across the session, not just isolated typos.
- Provide actionable coaching tips for future prompts.

Return ONLY valid JSON:
{
  "summary": "two or three sentences synthesizing prompt quality across the session",
  "patterns": ["pattern 1", "pattern 2"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`

export interface ReviewSessionInput {
  analysis: SessionAnalysis
  provider: LlmProvider
  signal?: AbortSignal
  maxTokens?: number
}

export async function reviewSessionPrompts(
  input: ReviewSessionInput,
): Promise<SessionLlmReview> {
  const { analysis, provider } = input

  const promptSummaries = analysis.prompts
    .map(
      (p) =>
        `Prompt #${p.index} [Score: ${p.analysis.score}/100, Grade: ${p.analysis.grade}]:\n"${p.prompt}"\nIssues: ${
          p.analysis.findings.map((f) => f.title).join(", ") || "none"
        }`,
    )
    .join("\n\n")

  const recurring =
    analysis.recurringIssues
      .map((r) => `- ${r.title} (${r.percentage}% of prompts): ${r.detail}`)
      .join("\n") || "- (none)"

  const userPrompt = [
    `Analyze all prompts sent in this coding agent session (${analysis.totalPrompts} prompts total).`,
    "",
    `Average heuristic score: ${analysis.averageScore}/100 (${analysis.grade})`,
    `Score trend: ${analysis.scoreTrend}`,
    "",
    "Recurring heuristic issues:",
    recurring,
    "",
    "Session prompts:",
    promptSummaries,
    "",
    "Synthesize the user's prompting patterns across the session and offer targeted coaching. Return JSON only.",
  ].join("\n")

  const raw = await provider.complete({
    system: SESSION_SYSTEM_PROMPT,
    prompt: userPrompt,
    maxTokens: input.maxTokens ?? 1200,
    signal: input.signal,
  })

  return parseSessionLlmReview(raw)
}

export function parseSessionLlmReview(raw: string): SessionLlmReview {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`could not parse model session review: ${message}`)
  }

  if (!isRecord(parsed)) {
    throw new Error("could not parse model session review: expected a JSON object")
  }

  const summary = asString(parsed.summary)
  const patterns = Array.isArray(parsed.patterns)
    ? parsed.patterns.map((item) => asString(item)).filter((s) => s.length > 0)
    : []
  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.map((item) => asString(item)).filter((s) => s.length > 0)
    : []

  if (!summary && patterns.length === 0 && recommendations.length === 0) {
    throw new Error("could not parse model session review: response was empty")
  }

  return {
    summary: summary || "The model did not return a session summary.",
    ...(patterns.length > 0 ? { patterns } : {}),
    ...(recommendations.length > 0 ? { recommendations } : {}),
  }
}

