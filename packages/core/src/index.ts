/**
 * @promptcraft/core
 *
 * A dependency-free prompt review engine. Adapters (OpenCode, Codex, CLI,
 * HTTP) call `analyze()` and decide how to present the result.
 */

export { analyze, analyzePrompt, gradeFor } from "./analyze.js"
export { extractFeatures } from "./features.js"
export {
  parseLlmReview,
  parseSessionLlmReview,
  reviewPrompt,
  reviewSessionPrompts,
} from "./llm.js"
export { formatReport, formatSummary } from "./report.js"
export {
  analyzeSession,
  analyzeSessionPrompts,
  computeScoreTrend,
  formatSessionReport,
} from "./session.js"
export { buildImprovedPrompt, describeTasks, normalizeAsk } from "./rewrite.js"
export { defaultRules } from "./rules/index.js"
export { defaultRules as rules } from "./rules/index.js"
export * from "./rules/index.js"

export type {
  Analysis,
  AnalyzeOptions,
  Category,
  Finding,
  Grade,
  LlmIssue,
  LlmProvider,
  LlmReview,
  PromptFeatures,
  RecurringIssue,
  Rule,
  RuleDetection,
  ScoreTrend,
  SessionAnalysis,
  SessionAnalyzeOptions,
  SessionLlmReview,
  SessionPromptAnalysis,
  SessionPromptInput,
  SessionPromptItem,
  SessionPromptSource,
  SessionReportOptions,
  Severity,
  TaskType,
} from "./types.js"
