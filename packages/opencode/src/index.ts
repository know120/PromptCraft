import { Plugin } from "@opencode/plugin"
import {
  analyze,
  analyzeSession,
  formatReport,
  formatSessionReport,
  type LlmProvider,
} from "@promptcraft/core"
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
    "",
    `To analyze all prompts sent in the current session, run \`/${options.sessionCommand}\`.`,
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

    const inMemoryPrompts = new Map<string, string[]>()
    if (typeof ctx.session.hook === "function") {
      try {
        await ctx.session.hook("prompt", (event) => {
          if (event && event.sessionID && event.prompt?.text) {
            const list = inMemoryPrompts.get(event.sessionID) ?? []
            list.push(event.prompt.text)
            inMemoryPrompts.set(event.sessionID, list)
          }
        })
      } catch {
        // hook registration not supported or optional in this environment
      }
    }

    const runSessionAnalysis = async (sessionID: string) => {
      try {
        let userPrompts: Array<{ text: string; timestamp?: number; id?: string }> = []

        try {
          const raw = await ctx.session.context({ sessionID })
          const list = Array.isArray(raw) ? raw : (raw as any)?.data ?? []

          for (const item of list) {
            if (item && item.type === "user" && typeof item.text === "string") {
              const text = item.text.trim()
              if (!text) continue

              // Skip promptcraft slash commands
              if (
                text.startsWith(`/${options.reviewCommand}`) ||
                text.startsWith(`/${options.applyCommand}`) ||
                text.startsWith(`/${options.sessionCommand}`) ||
                text.startsWith("/prompt-review-session") ||
                text.startsWith("/prompt-session")
              ) {
                continue
              }

              userPrompts.push({
                text,
                timestamp:
                  typeof item.time?.created === "number"
                    ? item.time.created
                    : undefined,
                id: typeof item.id === "string" ? item.id : undefined,
              })
            }
          }
        } catch {
          // If session context fails to fetch, fall back to in-memory recorded prompts
        }

        if (userPrompts.length === 0) {
          const fallback = inMemoryPrompts.get(sessionID) ?? []
          userPrompts = fallback
            .filter((t) => t.trim().length > 0)
            .map((text) => ({ text }))
        }

        if (userPrompts.length === 0) {
          await notice(
            sessionID,
            "## PromptCraft — Session Analysis\n\nNo user prompts found in this session yet. Prompts you send to the agent will be analyzed here.",
            "PromptCraft",
          )
          return
        }

        const llm = getProvider()
        const analysis = await analyzeSession(userPrompts, {
          llm,
          llmMode: options.llm,
          llmThreshold: options.llmThreshold,
        })

        await notice(
          sessionID,
          formatSessionReport(analysis),
          `PromptCraft session analysis · ${analysis.averageScore}/100`,
        )
      } catch (error) {
        await notice(sessionID, errorText(error), "PromptCraft")
      }
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

          if (text === "--session" || text === "-s" || text === "session") {
            await runSessionAnalysis(sessionID)
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

      const sessionCommands = new Set([
        options.sessionCommand,
        "prompt-session",
        "prompt-review-session",
      ])
      for (const name of sessionCommands) {
        editor.add({
          name,
          description: "Analyze all prompts sent in the current session",
          execute: async ({ sessionID }) => {
            await runSessionAnalysis(sessionID)
          },
        })
      }
    })
  },
})

