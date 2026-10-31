# `@promptcraft/opencode` — PromptCraft for OpenCode

The first PromptCraft adapter. It ships an OpenCode plugin that exposes two
explicit slash commands.

## Commands

- `/prompt-review <prompt>` — run the review, store the last result, post the
  report as a synthetic session message.
- `/prompt-apply` — send the stored scaffold through the session as a normal
  prompt, so it shows up as a real user turn.

## Options

Accepted via the plugin config entry (`{ "package": "opencode-promptcraft", "options": { ... } }`).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `llm` | `"auto" \| "always" \| "never"` | `"auto"` | Deep model review. |
| `model` | `{ providerID, id }` | OpenCode default | Model used for the deep review. |
| `reviewCommand` | `string` | `"prompt-review"` | Slash command for reviews. |
| `applyCommand` | `string` | `"prompt-apply"` | Slash command for applying the scaffold. |
| `llmThreshold` | `number` | `85` | Heuristic score under which `auto` calls the model. |
| `maxFindings` | `number` | `8` | Findings printed per report. |
| `immediate` | `boolean` | `false` | Advertise the report immediately instead of queueing it. See below. |

## How the plugin surfaces reports

OpenCode has no display-only transcript message. A plugin can only post content
through `session.synthetic`, which either queues (`resume: false`) or admits
(`resume: true`) into the session and starts a turn.

The plugin therefore defaults to queueing: reports are stored and posted with
`resume: false`, and appear when the session next runs. When the stored scaffold
is applied with `/prompt-apply`, the queued report is displayed ahead of the
scaffold turn.

Set `immediate: true` to admit reports right away. The report text is prefixed
with a display-only instruction before it is fed to the model, so the resulting
turn stays informational.

## LLM provider

The plugin adapts OpenCode's generation API to the core `LlmProvider`
interface:

```ts
interface LlmProvider {
  name: string
  complete(input: {
    system: string
    prompt: string
    maxTokens?: number
    signal?: AbortSignal
  }): Promise<string>
}
```

It resolves the model from `ctx.model.default()`, or uses the configured
`model`. No API key is required; it reuses whatever model OpenCode already has
selected.

## Development

From the repository root:

```sh
npm run build   # builds @promptcraft/core and this package
npm test
```
