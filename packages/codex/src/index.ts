import { analyze, type Analysis, type AnalyzeOptions } from "@promptcraft/core"

/**
 * Format a PromptCraft analysis as a prompt ready for Codex. Codex runs on
 * developer instructions plus a user task, so the suggested prompt becomes the
 * task body and the heuristic findings travel as review context.
 */
export function buildCodexPrompt(analysis: Analysis): string {
  const suggested = analysis.llm?.rewrittenPrompt ?? analysis.improvedPrompt
  const task =
    suggested?.trim() || "<the suggested prompt is empty; describe the change you want>"

  const sections: string[] = [
    "You are Codex, an autonomous coding agent.",
    "",
    "## Task",
    task,
    "",
  ]

  const context: string[] = []
  if (analysis.features.filePaths.length > 0) {
    context.push(`Files: ${analysis.features.filePaths.join(", ")}`)
  } else if (analysis.findings.some((finding) => finding.ruleId === "no-context")) {
    context.push("Files: <path/to/file>")
  }
  if (context.length > 0) {
    sections.push("## Context", context.join("\n"))
  }

  if (analysis.findings.some((finding) => finding.ruleId === "no-acceptance")) {
    sections.push("## Done when", "- [ ] <observable outcome: what should happen>")
  }
  if (analysis.findings.some((finding) => finding.ruleId === "no-constraints")) {
    sections.push("## Constraints", "- Do not change <out of scope>.")
  }

  return sections.join("\n")
}

/**
 * Build the prompt handed to a Codex model for a deeper review, mirroring the
 * OpenCode provider's system+user split.
 */
export function buildCodexReviewPrompt(prompt: string, analysis: Analysis): string {
  const heuristics = analysis.findings
    .map((finding) => `- [${finding.severity}] ${finding.title}: ${finding.detail}`)
    .join("\n")
  const taskTypes = analysis.features.taskTypes.join(", ")
  return [
    "You are Codex reviewing a coding-agent prompt.",
    "",
    "Review this prompt and return a JSON object:",
    "{",
    '  "summary": "one or two sentences",',
    '  "issues": [{ "title": "...", "detail": "...", "fix": "...", "severity": "error" | "warn" | "info" }],',
    '  "rewrittenPrompt": "a complete prompt the user can send as-is"',
    "}",
    "",
    "Prompt:",
    "```text",
    prompt,
    "```",
    "",
    `Heuristic score: ${analysis.score}/100 · task types: ${taskTypes}`,
    `Findings:\n${heuristics || "- (none)"}`,
    "",
    "Return JSON only.",
  ].join("\n")
}

/**
 * Run a review through the shared engine with Codex-flavored plumbing. The
 * adapter accepts any `LlmProvider`, so callers wire Codex's model backend
 * through the same interface the OpenCode adapter uses.
 */
export async function reviewWithCodex(
  prompt: string,
  options: AnalyzeOptions = {},
): Promise<Analysis> {
  return analyze(prompt, options)
}

export type { Analysis, AnalyzeOptions }
