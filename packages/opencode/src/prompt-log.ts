/** A user prompt remembered across compactions and plugin reloads. */
export interface StoredPrompt {
  id: string
  text: string
  createdAt: number
}

/** Keep storage small for very long sessions. */
export const MAX_STORED_PROMPTS = 200

const SESSION_REVIEW = /^(?:all|session|-a|--all|--session|-s)\b/i
const SESSION_SENTINEL = /^(?:all|session|-a|--all|--session|-s)$/i

/** `/prompt-review all`, `--all`, `session`, and their aliases. */
export function isSessionReview(text: string): boolean {
  return SESSION_REVIEW.test(text.trim())
}

/** A bare argument that should never be reviewed as a prompt. */
export function isSessionSentinel(text: string): boolean {
  return SESSION_SENTINEL.test(text.trim())
}

export function normalizePromptText(text: unknown): string {
  return typeof text === "string" ? text.trim() : ""
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** True for a stored user message that is one of this plugin's slash commands. */
export function isPromptCraftCommand(
  text: string,
  commands: readonly string[],
): boolean {
  const value = text.trim()
  return commands.some((command) =>
    new RegExp(`^/${escapeRegExp(command)}(?:\\s|$)`).test(value),
  )
}

/** Add a prompt once, trimming it and keeping only the newest entries. */
export function appendPrompt(
  prompts: readonly StoredPrompt[],
  prompt: StoredPrompt,
  limit = MAX_STORED_PROMPTS,
): readonly StoredPrompt[] {
  const text = normalizePromptText(prompt.text)
  if (!text) return prompts
  if (prompts.some((entry) => entry.id === prompt.id)) return prompts
  return [...prompts, { ...prompt, text }].slice(-limit)
}

export interface ContextMessage {
  id?: unknown
  type?: unknown
  text?: unknown
  time?: { created?: unknown } | null
}

export interface MergePromptsOptions {
  /** Drop command invocations and bare command arguments. */
  skipText?: (text: string) => boolean
}

/**
 * Merge prompts recorded by the prompt hook with whatever user messages the
 * session context still carries. `session.context` is the compacted,
 * model-visible transcript, so it can lose older prompts; the recorded log is
 * what keeps `/prompt-review all` complete.
 */
export function mergePrompts(
  stored: readonly StoredPrompt[],
  messages: readonly ContextMessage[],
  options: MergePromptsOptions = {},
): StoredPrompt[] {
  const merged: StoredPrompt[] = []
  const seen = new Set<string>()

  const push = (prompt: StoredPrompt) => {
    const text = normalizePromptText(prompt.text)
    if (!text || seen.has(prompt.id) || options.skipText?.(text)) return
    seen.add(prompt.id)
    merged.push({ ...prompt, text })
  }

  for (const prompt of stored) push(prompt)

  for (const message of messages) {
    if (message.type !== "user") continue
    if (typeof message.id !== "string") continue
    push({
      id: message.id,
      text: normalizePromptText(message.text),
      createdAt:
        typeof message.time?.created === "number" ? message.time.created : 0,
    })
  }

  return merged
}
