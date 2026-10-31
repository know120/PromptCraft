import type { PromptFeatures, TaskType } from "../types.js"

const CODE_TASKS: readonly TaskType[] = [
  "bug",
  "feature",
  "refactor",
  "test",
  "performance",
  "setup",
]

export function hasType(features: PromptFeatures, ...types: TaskType[]): boolean {
  return types.some((type) => features.taskTypes.includes(type))
}

export function isCodeTask(features: PromptFeatures): boolean {
  return hasType(features, ...CODE_TASKS)
}

/** A short, single-line excerpt suitable for inline evidence. */
export function excerpt(text: string, max = 120): string {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`
}

/** Quote a list of matched terms for use in a finding. */
export function quoted(values: readonly string[]): string {
  return values.map((value) => `\`${value}\``).join(", ")
}
