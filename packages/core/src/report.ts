import { describeTasks } from "./rewrite.js"
import type { Analysis, Finding, Severity } from "./types.js"

export interface ReportOptions {
  /** Maximum number of findings to print. Defaults to 8. */
  maxFindings?: number
  /** Include the improved prompt block. Defaults to true. */
  showImprovedPrompt?: boolean
  /** Include quoted evidence under each finding. Defaults to true. */
  showEvidence?: boolean
  /** Extra line at the end, e.g. how to apply the rewrite. */
  footer?: string
}

const SEVERITY_LABEL: Record<Severity, string> = {
  error: "high impact",
  warn: "worth fixing",
  info: "minor",
}

function progressBar(score: number, width = 12): string {
  const filled = Math.round((score / 100) * width)
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}  ${score}/100`
}

function quote(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Render a review as Markdown. Kept presentation-only so the same text works
 * in a terminal, in OpenCode's transcript, and on a web page.
 */
export function formatReport(
  analysis: Analysis,
  options: ReportOptions = {},
): string {
  const maxFindings = options.maxFindings ?? 8
  const showEvidence = options.showEvidence ?? true
  const lines: string[] = []

  lines.push(`## PromptCraft — ${analysis.score}/100 (${analysis.grade})`)
  lines.push(`\`${progressBar(analysis.score)}\``)
  lines.push("")

  const detected = describeTasks(analysis.features)
  const words = analysis.features.wordCount
  lines.push(`Detected: **${detected}**${words > 0 ? ` · ${words} words` : ""}`)
  lines.push("")

  if (analysis.findings.length === 0) {
    lines.push(
      "No rule-level problems found. The prompt states a goal, grounds it in code, and defines success.",
    )
  } else {
    const errors = analysis.findings.filter((finding) => finding.severity === "error").length
    const summary =
      errors > 0
        ? `${analysis.findings.length} issue${analysis.findings.length === 1 ? "" : "s"} · ${errors} high impact`
        : `${analysis.findings.length} issue${analysis.findings.length === 1 ? "" : "s"}`
    lines.push(`### What to fix · ${summary}`)
    lines.push("")

    const visible = analysis.findings.slice(0, maxFindings)
    visible.forEach((finding, index) => {
      lines.push(
        `**${index + 1}. ${finding.title}** · ${SEVERITY_LABEL[finding.severity]}`,
      )
      lines.push(finding.detail)
      lines.push(`→ **Fix:** ${finding.fix}`)
      if (showEvidence && finding.evidence) {
        lines.push(`> ${quote(finding.evidence)}`)
      }
      lines.push("")
    })

    const hidden = analysis.findings.length - visible.length
    if (hidden > 0) {
      lines.push(`_${hidden} lower-priority note${hidden === 1 ? "" : "s"} not shown._`)
      lines.push("")
    }
  }

  if (analysis.strengths.length > 0) {
    lines.push("### What already works")
    for (const strength of analysis.strengths) lines.push(`- ${strength}`)
    lines.push("")
  }

  const improved = analysis.llm?.rewrittenPrompt ?? analysis.improvedPrompt
  if (options.showImprovedPrompt !== false && improved) {
    lines.push(
      analysis.llm?.rewrittenPrompt
        ? "### Suggested prompt (model rewrite)"
        : "### Prompt scaffold",
    )
    lines.push("```text")
    lines.push(improved)
    lines.push("```")
    lines.push("")
  }

  if (analysis.llm) {
    lines.push("### Deeper review (model)")
    lines.push(analysis.llm.summary)
    if (analysis.llm.issues.length > 0) {
      lines.push("")
      for (const issue of analysis.llm.issues) {
        lines.push(`- **${issue.title}** — ${issue.detail}`)
        if (issue.fix) lines.push(`  _Fix:_ ${issue.fix}`)
      }
    }
    lines.push("")
  }

  if (analysis.llmError) {
    lines.push(`> Model review unavailable: ${analysis.llmError}`)
    lines.push("")
  }

  if (options.footer) {
    lines.push(options.footer)
    lines.push("")
  }

  return lines.join("\n").trim()
}

/** A one-line verdict, useful for status bars and CI annotations. */
export function formatSummary(analysis: Analysis): string {
  const top = analysis.findings[0]
  const suffix = top ? ` · top issue: ${top.title}` : ""
  return `PromptCraft ${analysis.score}/100 (${analysis.grade})${suffix}`
}

export type { Finding }
