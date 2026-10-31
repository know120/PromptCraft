import { extractFeatures } from "./features.js"
import { reviewPrompt } from "./llm.js"
import { buildImprovedPrompt } from "./rewrite.js"
import { defaultRules } from "./rules/index.js"
import type {
  Analysis,
  AnalyzeOptions,
  Finding,
  Grade,
  PromptFeatures,
} from "./types.js"

const GRADE_THRESHOLDS: ReadonlyArray<readonly [Grade, number]> = [
  ["A", 90],
  ["B", 80],
  ["C", 65],
  ["D", 50],
  ["F", 0],
]

export function gradeFor(score: number): Grade {
  return GRADE_THRESHOLDS.find(([, threshold]) => score >= threshold)?.[0] ?? "F"
}

const EMPTY_FEATURES = extractFeatures("")

function emptyAnalysis(prompt: string): Analysis {
  const finding: Finding = {
    ruleId: "empty-prompt",
    category: "clarity",
    severity: "error",
    title: "Empty prompt",
    weight: 100,
    detail: "There is nothing to review.",
    fix: "Describe the change you want, the code it touches, and how you will know it worked.",
  }
  return {
    prompt,
    score: 0,
    grade: "F",
    findings: [finding],
    strengths: [],
    features: EMPTY_FEATURES,
    improvedPrompt: "",
  }
}

/**
 * Run the rule set synchronously. No network, no model: deterministic and
 * fast enough to call on every keystroke if an adapter wants to.
 */
export function analyzePrompt(
  prompt: string,
  options: AnalyzeOptions = {},
): Analysis {
  const features = extractFeatures(prompt)
  if (!features.trimmed) return emptyAnalysis(prompt)

  const rules = options.rules ?? defaultRules
  const applicable = rules.filter((rule) => rule.applies?.(features) ?? true)

  const findings: Finding[] = []
  const strengths: string[] = []
  let applicableWeight = 0
  let failedWeight = 0

  for (const rule of applicable) {
    applicableWeight += rule.weight
    const detection = rule.detect(features)
    if (!detection) {
      if (rule.strength && rule.weight >= 5) strengths.push(rule.strength)
      continue
    }
    failedWeight += rule.weight
    findings.push({
      ...detection,
      ruleId: rule.id,
      category: rule.category,
      severity: rule.severity,
      title: rule.title,
      weight: rule.weight,
    })
  }

  findings.sort((a, b) => b.weight - a.weight)

  const rawScore =
    applicableWeight === 0
      ? 100
      : Math.round(100 * (1 - failedWeight / applicableWeight))
  const score = Math.max(0, Math.min(100, rawScore))

  return {
    prompt,
    score,
    grade: gradeFor(score),
    findings,
    strengths: [...new Set(strengths)],
    features,
    improvedPrompt: buildImprovedPrompt(features, findings),
  }
}

/**
 * Run the rules and, when configured, add a model review. A failed model call
 * never loses the heuristic result; the error is recorded in `llmError`.
 */
export async function analyze(
  prompt: string,
  options: AnalyzeOptions = {},
): Promise<Analysis> {
  const base = analyzePrompt(prompt, options)
  if (!options.llm || !base.features.trimmed) return base

  const mode = options.llmMode ?? "auto"
  if (mode === "never") return base
  if (mode === "auto" && base.score >= (options.llmThreshold ?? 85)) return base

  try {
    const llm = await reviewPrompt({
      prompt,
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

export type { PromptFeatures }
