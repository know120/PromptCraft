/**
 * Shared types for PromptCraft's analysis pipeline.
 *
 * The core is intentionally dependency-free: every value here is plain data so
 * that adapters (OpenCode, Codex, a CLI, an HTTP service) can consume it
 * without importing a UI or agent SDK.
 */

export type Severity = "error" | "warn" | "info"

export type Category =
  | "clarity"
  | "context"
  | "scope"
  | "verification"
  | "output"
  | "noise"

export type TaskType =
  | "bug"
  | "feature"
  | "refactor"
  | "test"
  | "docs"
  | "review"
  | "performance"
  | "setup"
  | "question"
  | "unknown"

export type Grade = "A" | "B" | "C" | "D" | "F"

/** A prompt reduced to the signals the rules reason about. */
export interface PromptFeatures {
  /** Original prompt, unchanged. */
  readonly prompt: string
  readonly trimmed: string
  readonly wordCount: number
  readonly charCount: number
  readonly lineCount: number
  readonly sentenceCount: number

  readonly hasCodeBlock: boolean
  readonly hasInlineCode: boolean
  readonly containsUrl: boolean

  /** Concrete file paths, e.g. `src/auth/login.ts` or `login.py`. */
  readonly filePaths: readonly string[]
  readonly hasFilePath: boolean

  /** Looks like pasted compiler/runtime output. */
  readonly hasErrorOutput: boolean
  /** Explicit reproduction steps or numbered instructions. */
  readonly hasSteps: boolean
  /** Expected result / "done when" wording. */
  readonly hasAcceptanceCriteria: boolean
  /** Scope boundaries such as "do not", "only", "without". */
  readonly hasConstraints: boolean
  /** Requested shape for the answer, e.g. JSON, table, diff. */
  readonly hasOutputFormat: boolean
  readonly hasExample: boolean
  readonly hasVerification: boolean
  readonly hasEnvironment: boolean
  readonly hasCurrentVsExpected: boolean

  readonly asksQuestion: boolean
  readonly hasMultipleQuestions: boolean
  /** Sentences that read like a command rather than a topic. */
  readonly imperativeSentenceCount: number
  /** Imperative sentences plus verbs joined by "and", "then", or a comma. */
  readonly imperativeClauseCount: number
  readonly listItemCount: number

  readonly vagueTerms: readonly string[]
  readonly ambiguousReferences: readonly string[]
  readonly hedgeTerms: readonly string[]
  readonly fillerTerms: readonly string[]
  readonly taskVerbs: readonly string[]
  readonly taskTypes: readonly TaskType[]

  /** Share of words of length >= 3 written in all caps. */
  readonly uppercaseWordRatio: number
  readonly hasRepeatedPunctuation: boolean
  readonly isSubstantive: boolean
}

/** What a single rule reports. Rule metadata is added by the analyzer. */
export interface RuleDetection {
  /** Why this is a problem for this specific prompt. */
  detail: string
  /** A concrete edit the user can make. */
  fix: string
  /** The offending text, for explainability. */
  evidence?: string
}

export interface Rule {
  id: string
  category: Category
  /** Short name of the mistake, e.g. "No acceptance criteria". */
  title: string
  /** Why the mistake matters. */
  description: string
  /** Relative importance, used for scoring. */
  weight: number
  severity: Severity
  /** Shown under "What already works" when the rule passes. */
  strength?: string
  /** Restrict the rule to prompts where it makes sense. */
  applies?: (features: PromptFeatures) => boolean
  detect: (features: PromptFeatures) => RuleDetection | null
}

export interface Finding extends RuleDetection {
  ruleId: string
  category: Category
  severity: Severity
  title: string
  weight: number
}

export interface LlmIssue {
  title: string
  detail: string
  fix: string
  severity: Severity
}

export interface LlmReview {
  summary: string
  issues: LlmIssue[]
  rewrittenPrompt?: string
}

export interface Analysis {
  readonly prompt: string
  readonly score: number
  readonly grade: Grade
  readonly findings: readonly Finding[]
  readonly strengths: readonly string[]
  readonly features: PromptFeatures
  /** A ready-to-send prompt scaffold built from the findings. */
  readonly improvedPrompt: string
  /** Optional deeper review from a model. */
  llm?: LlmReview
  /** Set when an LLM review was attempted but failed. */
  llmError?: string
}

export type AnalyzeOptions = {
  /** Replace the built-in rule set. */
  rules?: readonly Rule[]
  /** When set, an LLM review can be added to the result. */
  llm?: LlmProvider
  /**
   * `never` skips the model, `auto` uses it only when the heuristic score is
   * below `llmThreshold`, `always` always calls it.
   */
  llmMode?: "never" | "auto" | "always"
  llmThreshold?: number
  signal?: AbortSignal
}

export interface LlmProvider {
  readonly name: string
  complete(input: {
    system: string
    prompt: string
    maxTokens?: number
    signal?: AbortSignal
  }): Promise<string>
}
