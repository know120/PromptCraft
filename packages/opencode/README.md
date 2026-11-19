# `opencode-promptcraft` — PromptCraft for OpenCode

The first PromptCraft adapter. It ships an OpenCode plugin that exposes explicit
slash commands.

## Install

The package is not published to npm yet, so load it from a GitHub checkout:

```sh
git clone https://github.com/know120/PromptCraft.git
cd PromptCraft
npm install
npm run build
```

Then add the built package directory to your OpenCode config:

```jsonc
// ~/.config/opencode/opencode.json or the project's opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/to/PromptCraft/packages/opencode",
      "options": {
        "llm": "auto",
        "llmThreshold": 85
      }
    }
  ]
}
```

- Use an absolute path or `file:///absolute/path/to/PromptCraft/packages/opencode`.
- The directory must contain `dist/index.js`. Rerun `npm run build` after
  pulling.
- Restart OpenCode or run `opencode reload` after changing the entry;
  `opencode plugin list` should show `promptcraft`.
- OpenCode 1 needed a shim under `~/.config/opencode/plugins/`; the V2
  `plugins` entry replaces it, so remove the shim to avoid loading twice.
- When the package is published, `"package": "opencode-promptcraft"` works in
  place of the path.

## Commands

- `/prompt-review <prompt>` — run the review, store the last result, post the
  report as a synthetic session message.
- `/prompt-review all` — review every prompt sent in the session, post a single
  session report. The suggested prompt of the weakest prompt is stored, so
  `/prompt-apply` sends that one.
- `/prompt-apply` — send the stored suggested prompt through the session as a
  normal prompt, so it shows up as a real user turn.

## Reviewing a whole session

`/prompt-review all` switches the review command into session mode. `--all` and
`-a` work too. The plugin records each prompt through the session `prompt` hook
and merges that durable log with `ctx.session.context`, runs the analyzer over
each prompt, and posts a single report via `formatSessionReport` (a per-prompt
section plus an average score).

Recording prompts matters because `ctx.session.context` is the compacted,
model-visible transcript. Once OpenCode compacts a session, older user messages
can disappear from it; the recorded log keeps `/prompt-review all` complete
across compaction and plugin reloads. Prompts sent before PromptCraft was
loaded into a session are only available while they remain in that context.

## Options

Accepted via the plugin config entry:
`{ "package": "<path or package name>", "options": { ... } }`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `llm` | `"auto" \| "always" \| "never"` | `"auto"` | Deep model review. |
| `model` | `{ providerID, id }` | OpenCode default | Model used for the deep review. |
| `reviewCommand` | `string` | `"prompt-review"` | Slash command for reviews. |
| `applyCommand` | `string` | `"prompt-apply"` | Slash command for applying the suggested prompt. |
| `llmThreshold` | `number` | `85` | Heuristic score under which `auto` calls the model. |
| `maxFindings` | `number` | `8` | Findings printed per report. |
| `immediate` | `boolean` | `false` | Advertise the report immediately instead of queueing it. See below. |

## How the plugin surfaces reports

OpenCode has no display-only transcript message. A plugin can only post content
through `session.synthetic`, which either queues (`resume: false`) or admits
(`resume: true`) into the session and starts a turn.

The plugin therefore defaults to queueing: reports are stored and posted with
`resume: false`, and appear when the session next runs. When the stored suggested
prompt is applied with `/prompt-apply`, the queued report is displayed ahead of
the suggested-prompt turn.

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
