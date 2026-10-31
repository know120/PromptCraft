import { Plugin } from "@opencode/plugin"
import { analyze, formatReport, type LlmProvider } from "@promptcraft/core"
import { readOptions, type PromptCraftOptions } from "./options.js"
import { createOpenCodeProvider } from "./provider.js"

interface StoredReview {
  improvedPrompt: string
  score: number
  createdAt: number
}

const storageKey = (sessionID: string) => `last-review/${sessionID}`

function usage(options: PromptCraftOptions): string {
  return [
    "## PromptCraft",
    "",
    `Usage: \`/${options.reviewCommand} <your prompt>\``,
    "",
    "It reviews the prompt before you send it, lists what will confuse the agent, and builds a stronger version.",
    `Then run \`/${options.applyCommand}\` to send that version, or edit your prompt yourself.`,
  ].join("\n")
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `## PromptCraft\n\nReview failed: ${message}`
}

export default Plugin.define({
  id: "promptcraft",
  async setup(ctx) {
    const options = readOptions(ctx.options)

    /**
     * OpenCode has no display-only transcript message: `session.synthetic`
     * either waits in the inbox (`resume: false`) or is admitted into the
     * session and starts a turn (`resume: true`). Keep the choice explicit and
     * tell the model to ignore a deliver-now report.
     */
    const notice = (sessionID: string, text: string, description: string) =>
      ctx.session.synthetic({
        sessionID,
        text: options.immediate
          ? `_The PromptCraft report below is display-only. Do not modify files or run tools in response to it._\n\n${text}`
          : text,
        description,
        resume: options.immediate,
      })

    let provider: LlmProvider | undefined
    const getProvider = (): LlmProvider | undefined => {
      if (options.llm === "never") return undefined
      provider ??= createOpenCodeProvider(ctx, options.model)
      return provider
    }

    await ctx.command.transform((editor) => {
      editor.add({
        name: options.reviewCommand,
        description: "Review a prompt for mistakes and build a stronger version",
        execute: async ({ sessionID, prompt }) => {
          const text = prompt.text.trim()
          if (!text) {
            await notice(sessionID, usage(options), "PromptCraft")
            return
          }

          try {
            const llm = getProvider()
            const analysis = await analyze(text, {
              llm,
              llmMode: options.llm,
              llmThreshold: options.llmThreshold,
            })

            const stored: StoredReview = {
              improvedPrompt: analysis.llm?.rewrittenPrompt ?? analysis.improvedPrompt,
              score: analysis.score,
              createdAt: Date.now(),
            }
            await ctx.storage.set(
              storageKey(sessionID),
              { ...stored } as Record<string, string | number>,
            )

            await notice(
              sessionID,
              formatReport(analysis, {
                maxFindings: options.maxFindings,
                footer:
                  analysis.findings.length > 0
                    ? `Run \`/${options.applyCommand}\` to send the scaffold, or edit your prompt and resend it.`
                    : undefined,
              }),
              `PromptCraft review · ${analysis.score}/100`,
            )
          } catch (error) {
            await notice(sessionID, errorText(error), "PromptCraft")
          }
        },
      })

      editor.add({
        name: options.applyCommand,
        description: "Send the improved prompt from the last PromptCraft review",
        execute: async ({ sessionID, delivery }) => {
          const stored = (await ctx.storage.get(storageKey(sessionID))) as
            | StoredReview
            | undefined

          if (!stored?.improvedPrompt) {
            await notice(
              sessionID,
              `No reviewed prompt is stored for this session. Run \`/${options.reviewCommand} <your prompt>\` first.`,
              "PromptCraft",
            )
            return
          }

          await ctx.storage.remove(storageKey(sessionID))
          await ctx.session.prompt({
            sessionID,
            text: stored.improvedPrompt,
            delivery,
          })
        },
      })
    })
  },
})
