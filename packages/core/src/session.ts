import { analyzePrompt, gradeFor } from "./analyze.js"
import { reviewSessionPrompts } from "./llm.js"
import { describeTasks } from "./rewrite.js"
import type {
  Finding,
  RecurringIssue,
  ScoreTrend,
  SessionAnalysis,
  SessionAnalyzeOptions,
  SessionPromptAnalysis,
  SessionPromptSource,
  SessionReportOptions,
  Severity,
} from "./types.js"

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
 * Determine score trajectory across multiple turns.
 */
export function computeScoreTrend(scores: readonly number[]): ScoreTrend {
  if (scores.length < 2) return "insufficient_data"

  if (scores.length === 2) {
    const diff = (scores[1] ?? 0) - (scores[0] ?? 0)
    if (diff >= 5) return "improving"
    if (diff <= -5) return "declining"
    return "steady"
  }

  const mid = Math.floor(scores.length / 2)
  const firstHalf = scores.slice(0, mid)
  const secondHalf = scores.slice(scores.length - mid)
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
  const diff = secondAvg - firstAvg

  if (diff >= 5) return "improving"
  if (diff <= -5) return "declining"
  return "steady"
}

/**
 * Run deterministic heuristic analysis across all prompts in a session.
 */
export function analyzeSessionPrompts(
  prompts: readonly SessionPromptSource[],
  options: SessionAnalyzeOptions = {},
): SessionAnalysis {
  const normalized: Array<{ text: string; timestamp?: number; id?: string }> = []

  for (const item of prompts) {
    if (typeof item === "string") {
      const text = item.trim()
      if (text) normalized.push({ text })
    } else if (item && typeof item.text === "string") {
      const text = item.text.trim()
      if (text) normalized.push({ text, timestamp: item.timestamp, id: item.id })
    }
  }

  if (normalized.length === 0) {
    return {
      prompts: [],
      totalPrompts: 0,
      averageScore: 0,
      grade: "F",
      scoreTrend: "insufficient_data",
      scoreHistory: [],
      recurringIssues: [],
      commonStrengths: [],
      bestPrompt: undefined,
      worstPrompt: undefined,
    }
  }

  const promptAnalyses: SessionPromptAnalysis[] = normalized.map((item, index) => {
    const analysis = analyzePrompt(item.text, options)
    return {
      index: index + 1,
      prompt: item.text,
      analysis,
      timestamp: item.timestamp,
      id: item.id,
    }
  })

  const scores = promptAnalyses.map((p) => p.analysis.score)
  const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  const grade = gradeFor(averageScore)
  const scoreTrend = computeScoreTrend(scores)

  let bestPrompt: SessionPromptAnalysis = promptAnalyses[0]!
  let worstPrompt: SessionPromptAnalysis = promptAnalyses[0]!

  for (const item of promptAnalyses) {
    if (item.analysis.score > bestPrompt.analysis.score) {
      bestPrompt = item
    }
    if (item.analysis.score < worstPrompt.analysis.score) {
      worstPrompt = item
    }
  }

  // Aggregate recurring issues
  const issueCounts = new Map<
    string,
    {
      finding: Finding
      count: number
    }
  >()

  for (const item of promptAnalyses) {
    for (const finding of item.analysis.findings) {
      const existing = issueCounts.get(finding.ruleId)
      if (existing) {
        existing.count += 1
      } else {
        issueCounts.set(finding.ruleId, { finding, count: 1 })
      }
    }
  }

  const minOccurrences = promptAnalyses.length >= 2 ? 2 : 1
  const recurringIssues: RecurringIssue[] = Array.from(issueCounts.values())
    .filter((entry) => entry.count >= minOccurrences)
    .map((entry) => ({
      ruleId: entry.finding.ruleId,
      title: entry.finding.title,
      category: entry.finding.category,
      severity: entry.finding.severity,
      weight: entry.finding.weight,
      count: entry.count,
      percentage: Math.round((entry.count / promptAnalyses.length) * 100),
      detail: entry.finding.detail,
      fix: entry.finding.fix,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return b.weight - a.weight
    })

  const maxRecurring = options.maxRecurringIssues ?? 5
  const truncatedRecurring = recurringIssues.slice(0, maxRecurring)

  // Aggregate common strengths
  const strengthCounts = new Map<string, number>()
  for (const item of promptAnalyses) {
    for (const strength of item.analysis.strengths) {
      strengthCounts.set(strength, (strengthCounts.get(strength) ?? 0) + 1)
    }
  }

  const minStrengthOccurrences = promptAnalyses.length >= 2 ? 2 : 1
  const commonStrengths = Array.from(strengthCounts.entries())
    .filter(([, count]) => count >= minStrengthOccurrences)
    .sort(([, a], [, b]) => b - a)
    .map(([strength]) => strength)

  return {
    prompts: promptAnalyses,
    totalPrompts: promptAnalyses.length,
    averageScore,
    grade,
    scoreTrend,
    scoreHistory: scores,
    recurringIssues: truncatedRecurring,
    commonStrengths,
    bestPrompt,
    worstPrompt,
  }
}

/**
 * Run heuristic analysis across all session prompts with optional model review.
 */
export async function analyzeSession(
  prompts: readonly SessionPromptSource[],
  options: SessionAnalyzeOptions = {},
): Promise<SessionAnalysis> {
  const base = analyzeSessionPrompts(prompts, options)
  if (!options.llm || base.totalPrompts === 0) return base

  const mode = options.llmMode ?? "auto"
  if (mode === "never") return base
  if (mode === "auto" && base.averageScore >= (options.llmThreshold ?? 85)) return base

  try {
    const llm = await reviewSessionPrompts({
      analysis: base,
      provider: options.llm,
      signal: options.signal,
    })
    return { ...base, llm }
  } catch (error) {
    return {
      ...base,
      llmError: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Render a session analysis as Markdown.
 */
export function formatSessionReport(
  analysis: SessionAnalysis,
  options: SessionReportOptions = {},
): string {
  const lines: string[] = []

  if (analysis.totalPrompts === 0) {
    lines.push("## PromptCraft — Session Analysis")
    lines.push("")
    lines.push("No user prompts were found in this session.")
    if (options.footer) {
      lines.push("")
      lines.push(options.footer)
    }
    return lines.join("\n").trim()
  }

  lines.push(
    `## PromptCraft — Session Analysis · ${analysis.averageScore}/100 (${analysis.grade})`,
  )
  lines.push(`\`${progressBar(analysis.averageScore)}\``)
  lines.push("")

  lines.push(
    `### Overview · ${analysis.totalPrompts} prompt${analysis.totalPrompts === 1 ? "" : "s"} analyzed`,
  )
  lines.push(`- **Average score:** ${analysis.averageScore}/100 (Grade ${analysis.grade})`)

  if (analysis.scoreTrend !== "insufficient_data") {
    const trendLabel =
      analysis.scoreTrend.charAt(0).toUpperCase() + analysis.scoreTrend.slice(1)
    const historyStr = analysis.scoreHistory.join(" → ")
    lines.push(`- **Score trend:** ${trendLabel} (${historyStr})`)
  }

  if (analysis.bestPrompt && analysis.totalPrompts > 1) {
    lines.push(
      `- **Highest scoring prompt:** #${analysis.bestPrompt.index} (${analysis.bestPrompt.analysis.score}/100 · Grade ${analysis.bestPrompt.analysis.grade})`,
    )
  }
  if (
    analysis.worstPrompt &&
    analysis.totalPrompts > 1 &&
    analysis.worstPrompt.index !== analysis.bestPrompt?.index
  ) {
    lines.push(
      `- **Prompt needing most attention:** #${analysis.worstPrompt.index} (${analysis.worstPrompt.analysis.score}/100 · Grade ${analysis.worstPrompt.analysis.grade})`,
    )
  }
  lines.push("")

  if (analysis.recurringIssues.length > 0) {
    lines.push("### Recurring habits across session")
    const maxRecurring = options.maxRecurringIssues ?? 5
    const visibleIssues = analysis.recurringIssues.slice(0, maxRecurring)
    visibleIssues.forEach((issue, i) => {
      lines.push(
        `**${i + 1}. ${issue.title}** · occurred in ${issue.count} of ${analysis.totalPrompts} prompts (${issue.percentage}%) · ${SEVERITY_LABEL[issue.severity]}`,
      )
      lines.push(issue.detail)
      lines.push(`→ **Fix:** ${issue.fix}`)
      lines.push("")
    })
  } else if (analysis.totalPrompts > 1) {
    lines.push("### Habits across session")
    lines.push("No recurring mistakes detected across the session.")
    lines.push("")
  }

  if (analysis.commonStrengths.length > 0) {
    lines.push("### What consistently worked well")
    for (const strength of analysis.commonStrengths) {
      lines.push(`- ${strength}`)
    }
    lines.push("")
  }

  if (analysis.llm) {
    lines.push("### Deeper review (model)")
    lines.push(analysis.llm.summary)
    if (analysis.llm.patterns && analysis.llm.patterns.length > 0) {
      lines.push("")
      lines.push("**Observed patterns:**")
      for (const pattern of analysis.llm.patterns) {
        lines.push(`- ${pattern}`)
      }
    }
    if (analysis.llm.recommendations && analysis.llm.recommendations.length > 0) {
      lines.push("")
      lines.push("**Recommendations:**")
      for (const rec of analysis.llm.recommendations) {
        lines.push(`- ${rec}`)
      }
    }
    lines.push("")
  }

  if (analysis.llmError) {
    lines.push(`> Model session review unavailable: ${analysis.llmError}`)
    lines.push("")
  }

  if (options.showPromptBreakdown !== false) {
    lines.push("### Prompt breakdown")
    const maxBreakdown = options.maxPromptBreakdown ?? 10
    const visiblePrompts = analysis.prompts.slice(0, maxBreakdown)
    visiblePrompts.forEach((item) => {
      const task = describeTasks(item.analysis.features)
      const words = item.analysis.features.wordCount
      lines.push(
        `**#${item.index}. ${item.analysis.score}/100 (${item.analysis.grade})** · ${words} words · ${task}`,
      )
      const snippet =
        item.prompt.length > 120 ? `${item.prompt.slice(0, 117)}...` : item.prompt
      lines.push(`> ${quote(snippet)}`)
      if (item.analysis.findings.length > 0) {
        const topIssues = item.analysis.findings
          .slice(0, 3)
          .map((f) => f.title)
          .join(", ")
        lines.push(`- _Top issues:_ ${topIssues}`)
      } else {
        lines.push(`- _No issues detected._`)
      }
      lines.push("")
    })

    if (analysis.prompts.length > visiblePrompts.length) {
      const remaining = analysis.prompts.length - visiblePrompts.length
      lines.push(
        `_${remaining} earlier prompt${remaining === 1 ? "" : "s"} not shown in breakdown._`,
      )
      lines.push("")
    }
  }

  if (options.footer) {
    lines.push(options.footer)
    lines.push("")
  }

  return lines.join("\n").trim()
}
