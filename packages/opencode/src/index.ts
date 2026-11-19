import { Plugin } from "@opencode/plugin"
import {
  analyze,
  formatReport,
  formatSessionReport,
  type Analysis,
  type LlmProvider,
} from "@promptcraft/core"
import { readOptions, type PromptCraftOptions } from "./options.js"
import {
  appendPrompt,
  isPromptCraftCommand,
  isSessionReview,
  isSessionSentinel,
  mergePrompts,
  type StoredPrompt,
} from "./prompt-log.js"
import { createOpenCodeProvider } from "./provider.js"

interface StoredReview {
  improvedPrompt: string
  score: number
  createdAt: number
}

const storageKey = (sessionID: string) => `last-review/${sessionID}`
const promptKey = (sessionID: string) => `prompts/${sessionID}`

function usage(options: PromptCraftOptions): string {
  return [
    "## PromptCraft",
    "",
    `Usage: \`/${options.reviewCommand} <your prompt>\``,
    "",
    "It reviews the prompt before you send it, lists what will confuse the agent, and builds a stronger version.",
    `Then run \`/${options.applyCommand}\` to send that version, or edit your prompt yourself.`,
    "",
    `Run \`/prompt-review all\` to review every prompt sent in this session.`,
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

    const readStoredPrompts = async (
      sessionID: string,
    ): Promise<StoredPrompt[]> => {
      const raw = await ctx.storage.get(promptKey(sessionID))
      if (!Array.isArray(raw)) return []

      const prompts: StoredPrompt[] = []
      for (const entry of raw) {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          continue
        }
        const record = entry as Record<string, unknown>
        if (typeof record.id !== "string" || typeof record.text !== "string") {
          continue
        }
        prompts.push({
          id: record.id,
          text: record.text,
          createdAt:
            typeof record.createdAt === "number" ? record.createdAt : 0,
        })
      }
      return prompts
    }

    const writeStoredPrompts = (
      sessionID: string,
      prompts: readonly StoredPrompt[],
    ) =>
      ctx.storage.set(
        promptKey(sessionID),
        prompts as unknown as Array<Record<string, string | number>>,
      )

    /**
     * The prompt hook runs before a prompt is admitted and may run more than
     * once for the same message, so writes are serialized per session and
     * deduped by message ID.
     */
    const promptWrites = new Map<string, Promise<void>>()
    const queuePromptWrite = (
      sessionID: string,
      task: () => Promise<void>,
    ): Promise<void> => {
      const previous = promptWrites.get(sessionID) ?? Promise.resolve()
      const next = previous.then(task, task).catch((error: unknown) => {
        console.error("PromptCraft: could not save a prompt", error)
      })
      promptWrites.set(sessionID, next)
      void next.then(() => {
        if (promptWrites.get(sessionID) === next) promptWrites.delete(sessionID)
      })
      return next
    }

    const isCommandText = (text: string) =>
      isSessionSentinel(text) ||
      isPromptCraftCommand(text, [
        options.reviewCommand,
        options.applyCommand,
      ])

    await ctx.session.hook("prompt", (event) => {
      const text = event.prompt.text.trim()
      if (!text || isCommandText(text)) return

      const id = String(event.messageID)
      return queuePromptWrite(event.sessionID, async () => {
        const current = await readStoredPrompts(event.sessionID)
        const next = appendPrompt(current, {
          id,
          text,
          createdAt: Date.now(),
        })
        if (next !== current) await writeStoredPrompts(event.sessionID, next)
      })
    })

    let provider: LlmProvider | undefined
    const getProvider = (): LlmProvider | undefined => {
      if (options.llm === "never") return undefined
      provider ??= createOpenCodeProvider(ctx, options.model)
      return provider
    }

    const reviewSingle = async (
      sessionID: string,
      text: string,
    ): Promise<void> => {
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
                ? `Run \`/${options.applyCommand}\` to send the suggested prompt, or edit your prompt and resend it.`
                : undefined,
          }),
          `PromptCraft review · ${analysis.score}/100`,
        )
      } catch (error) {
        await notice(sessionID, errorText(error), "PromptCraft")
      }
    }

    const runSessionReview = async (sessionID: string): Promise<void> => {
      const llm = getProvider()

      // `session.context` is the compacted, model-visible transcript, so it
      // loses prompts after compaction. Merge in the hook's durable log so a
      // session review still sees prompts from before the compaction.
      const messages = await ctx.session.context({ sessionID })
      await promptWrites.get(sessionID)
      const merged = mergePrompts(
        await readStoredPrompts(sessionID),
        messages,
        { skipText: isCommandText },
      )
      if (merged.length > 0) await writeStoredPrompts(sessionID, merged)

      if (merged.length === 0) {
        const compacted = messages.some((message) => message.type === "compaction")
        await notice(
          sessionID,
          compacted
            ? [
                "## PromptCraft — Session review",
                "",
                "No prompts are available. OpenCode compacted this session before",
                "PromptCraft recorded its prompts. Prompts sent from now on will be",
                "included in later reviews.",
              ].join("\n")
            : [
                "## PromptCraft — Session review",
                "",
                "No prompts found in this session yet. Send a prompt first, or run",
                `\`/${options.reviewCommand} <your prompt>\` to review one directly.`,
              ].join("\n"),
          "PromptCraft",
        )
        return
      }

      const analyses: Analysis[] = []
      for (const entry of merged) {
        analyses.push(await analyze(entry.text, { llm, llmMode: options.llm, llmThreshold: options.llmThreshold }))
      }

      const averageScore = Math.round(
        analyses.reduce((sum, analysis) => sum + analysis.score, 0) / analyses.length,
      )
      const worstIndex = analyses.reduce(
        (worst, analysis, index) =>
          analysis.score < analyses[worst]!.score ? index : worst,
        0,
      )
      const weakest = analyses[worstIndex]!

      await ctx.storage.set(
        storageKey(sessionID),
        {
          improvedPrompt: weakest.llm?.rewrittenPrompt ?? weakest.improvedPrompt,
          score: weakest.score,
          createdAt: Date.now(),
        } as Record<string, string | number>,
      )

      await notice(
        sessionID,
        formatSessionReport(
          {
            entries: merged.map((entry, index) => ({ prompt: entry.text, analysis: analyses[index]! })),
            averageScore,
          },
          {
            maxFindings: options.maxFindings,
            footer: `Run \`/${options.applyCommand}\` to send the suggested prompt of the weakest prompt, or edit your prompt and resend it.`,
          },
        ),
        `PromptCraft session review · ${analyses.length} prompts`,
      )
    }

    const reviewSession = async (sessionID: string): Promise<void> => {
      try {
        await runSessionReview(sessionID)
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
          if (isSessionReview(text)) {
            await reviewSession(sessionID)
            return
          }
          if (!text) {
            await notice(sessionID, usage(options), "PromptCraft")
            return
          }
          await reviewSingle(sessionID, text)
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
