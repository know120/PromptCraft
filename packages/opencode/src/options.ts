export type LlmMode = "auto" | "always" | "never"

export interface PromptCraftOptions {
  /** When to ask a model for a deeper review. Defaults to `auto`. */
  llm: LlmMode
  /** Model used for the deeper review. Defaults to OpenCode's selected model. */
  model?: { providerID: string; id: string }
  /** Command that reviews a prompt. Defaults to `prompt-review`. */
  reviewCommand: string
  /** Command that sends the stored scaffold. Defaults to `prompt-apply`. */
  applyCommand: string
  /** Score below which `auto` triggers a model review. Defaults to 85. */
  llmThreshold: number
  /** Maximum findings printed in the report. Defaults to 8. */
  maxFindings: number
  /**
   * Deliver reports immediately. OpenCode can only show a synthetic message by
   * admitting it into the session, which starts an assistant turn, so this
   * costs one model call per report. Defaults to false: the report waits in the
   * inbox and appears at the start of the next turn.
   */
  immediate: boolean
}

const COMMAND_RE = /^[a-z0-9][a-z0-9_-]*$/

function readCommand(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const name = value.replace(/^\//, "").trim().toLowerCase()
  return COMMAND_RE.test(name) ? name : fallback
}

function readModel(value: unknown): PromptCraftOptions["model"] {
  if (typeof value !== "object" || value === null) return undefined
  const record = value as Record<string, unknown>
  const providerID = record.providerID
  const id = record.id ?? record.modelID
  if (typeof providerID !== "string" || typeof id !== "string") return undefined
  return { providerID, id }
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function readLlmMode(value: unknown): LlmMode {
  if (value === true) return "auto"
  if (value === false) return "never"
  return value === "always" || value === "never" || value === "auto" ? value : "auto"
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Plugin options are untrusted JSON from `opencode.json(c)`. */
export function readOptions(
  raw: Readonly<Record<string, unknown>> = {},
): PromptCraftOptions {
  return {
    llm: readLlmMode(raw.llm),
    model: readModel(raw.model),
    reviewCommand: readCommand(raw.reviewCommand, "prompt-review"),
    applyCommand: readCommand(raw.applyCommand, "prompt-apply"),
    llmThreshold: readNumber(raw.llmThreshold, 85, 0, 100),
    maxFindings: readNumber(raw.maxFindings, 8, 1, 20),
    immediate: readBoolean(raw.immediate, false),
  }
}
