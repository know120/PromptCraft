import type { Plugin } from "@opencode/plugin"
import type { LlmProvider } from "@promptcraft/core"

type ModelRef = { providerID: string; id: string }

async function resolveDefaultModel(ctx: Plugin.Context): Promise<ModelRef | undefined> {
  const selected = await ctx.model.default()
  const info = selected.data
  if (!info) return undefined
  return { providerID: info.providerID, id: info.id }
}

/**
 * Adapt OpenCode's stateless generation endpoint to PromptCraft's LLM
 * interface. This reuses the model already configured in OpenCode, so the
 * plugin needs no API key of its own.
 *
 * `generate.text` has no system-prompt slot, so the system prompt is joined
 * into the user prompt. It also has no abort signal; cancellation is handled
 * by the caller's heuristics still being available.
 */
export function createOpenCodeProvider(
  ctx: Plugin.Context,
  configured?: ModelRef,
): LlmProvider {
  return {
    name: `opencode${configured ? `:${configured.providerID}/${configured.id}` : ""}`,
    async complete({ system, prompt }) {
      const model = configured ?? (await resolveDefaultModel(ctx))
      if (!model) {
        throw new Error(
          "no model is available for the deeper review; set a default model or pass `model` in the plugin options",
        )
      }
      // `generate` moved under `experimental` in newer plugin versions. Keep
      // the top-level fallback so the same build works on both surfaces.
      const generate = ctx.experimental.generate ?? ctx.generate
      const response = await generate.text({
        model,
        prompt: `${system}\n\n---\n\n${prompt}`,
      })
      return response.text
    },
  }
}
