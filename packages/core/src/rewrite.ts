import type { Analysis, Finding, Grade, PromptFeatures } from "./types.js"

const TASK_NOUNS: Partial<Record<string, string>> = {
  bug: "bug fix",
  feature: "feature",
  refactor: "refactor",
  test: "test change",
  docs: "documentation",
  review: "review",
  performance: "performance work",
  setup: "setup change",
  question: "question",
  unknown: "request",
}

export function describeTasks(features: PromptFeatures): string {
  const names = features.taskTypes
    .filter((type) => type !== "unknown")
    .map((type) => TASK_NOUNS[type] ?? type)
  if (names.length === 0) return "request"
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/**
 * Strip pleasantries and vague hedges from the opening of the request, then
 * tidy whitespace. Deliberately conservative: only well-known filler patterns
 * are removed so the meaning of the prompt is preserved.
 */
export function normalizeAsk(prompt: string): string {
  let text = prompt.trim()
  text = text.replace(/^(?:please|kindly|hey|hi|hello)[\s,]+/i, "")
  text = text.replace(/^(?:can|could|would|will)\s+you\s+(?:please\s+)?/i, "")
  text = text.replace(/^i\s+(?:want|need|would\s+like)\s+you\s+to\s+/i, "")
  text = text.replace(/[\s,;.!]*(?:thanks|thank you|please)[.!]*\s*$/i, "")
  text = text.replace(/\b(?:maybe|perhaps|probably|if possible|kind of|sort of)\s+/gi, "")
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  text = text.replace(/[\s,;:]+$/, "").trim()
  if (/^[a-z]/.test(text)) text = text[0]!.toUpperCase() + text.slice(1)
  return text
}

const has = (findings: readonly Finding[], ruleId: string): boolean =>
  findings.some((finding) => finding.ruleId === ruleId)

/**
 * Build a ready-to-send prompt scaffold from the original request plus the
 * sections the review found missing. Unknown details stay as visible
 * placeholders so the user can fill them in rather than guessing.
 */
export function buildImprovedPrompt(
  features: PromptFeatures,
  findings: readonly Finding[],
): string {
  const ask = normalizeAsk(features.trimmed)
  const isBug = features.taskTypes.includes("bug")
  const isSetup = features.taskTypes.includes("setup")
  const isCodeChange = features.taskTypes.some((type) =>
    ["bug", "feature", "refactor", "performance", "setup", "test"].includes(type),
  )
  const wantsProse = features.taskTypes.some((type) =>
    ["review", "docs", "question"].includes(type),
  )

  const sections: string[] = []
  sections.push(`## Task\n${ask || "<describe the change you want>"}`)

  const context: string[] = []
  if (!features.hasFilePath && isCodeChange) {
    context.push("- Relevant files: `<path/to/file>`")
  }
  if (!features.hasCurrentVsExpected && (isBug || features.taskTypes.includes("refactor"))) {
    context.push(
      "- Current behaviour: <what happens now>",
      "- Expected behaviour: <what should happen instead>",
    )
  }
  if (isBug && !features.hasErrorOutput) {
    context.push(
      "- Error output:",
      "  ```text",
      "  <paste the exact error and stack trace>",
      "  ```",
    )
  }
  if (!features.hasEnvironment && (isBug || isSetup)) {
    context.push("- Environment: `<runtime + version>`, `<operating system>`")
  }
  if (context.length > 0) sections.push(`## Context\n${context.join("\n")}`)

  if (isBug && !features.hasSteps) {
    sections.push(
      "## Steps to reproduce\n1. <first step>\n2. <second step>\n3. <observe the failure>",
    )
  }

  const done: string[] = []
  if (!features.hasAcceptanceCriteria) {
    done.push("- [ ] <observable outcome: what should happen>")
  }
  if (!features.hasVerification && isCodeChange) {
    done.push("- [ ] `<test or build command>` passes")
  }
  if (done.length > 0) sections.push(`## Done when\n${done.join("\n")}`)

  if (!features.hasConstraints && isCodeChange && has(findings, "no-constraints")) {
    sections.push(
      "## Constraints\n- Do not change <out of scope>.\n- Preserve <existing behaviour>.\n- New dependencies: <allowed / not allowed>.",
    )
  }

  if (wantsProse && !features.hasOutputFormat) {
    sections.push(
      "## Output\n- <short bullet list / table / diff>, at most <N> items.",
    )
  }

  if (has(findings, "multi-task")) {
    sections.push(
      "## Scope\n- Complete only the tasks above in one pass.\n- Do not make unrelated changes.",
    )
  }

  sections.push("If anything above is still ambiguous, ask before making changes.")
  return sections.join("\n\n")
}
