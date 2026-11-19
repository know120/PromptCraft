# `codex-promptcraft` — PromptCraft for Codex

Codex-flavored helpers over the shared `@promptcraft/core` engine:

- `buildCodexPrompt(analysis)` — turn an analysis into a Codex task prompt with
  context, done-when, and constraint sections.
- `buildCodexReviewPrompt(prompt, analysis)` — build the system prompt for a
  deeper model review.
- `reviewWithCodex(prompt, options)` — run the shared analysis with any
  `LlmProvider` wired in.

## Use it in Codex

Codex uses skills. Install the PromptCraft skill and the shared CLI from
GitHub, since the packages are not on npm yet:

```sh
git clone https://github.com/know120/PromptCraft.git
cd PromptCraft
npm install
npm run build
(cd packages/cli && npm link)
promptcraft install codex --global
```

Without `npm link`:

```sh
node /absolute/path/to/PromptCraft/packages/cli/dist/cli.js install codex --global \
  --cli "node /absolute/path/to/PromptCraft/packages/cli/dist/cli.js"
```

Restart Codex, then run `$promptcraft` with the prompt you want reviewed. See the
[harness guide](https://github.com/know120/PromptCraft/blob/main/docs/enable-in-any-harness.md#codex)
for the full walkthrough.

## Library usage

```ts
import { analyzePrompt } from "@promptcraft/core"
import { buildCodexPrompt, reviewWithCodex } from "codex-promptcraft"

const analysis = await reviewWithCodex("fix the login thing, it's broken")
const task = buildCodexPrompt(analysis)
```

## Development

```sh
npm run build
npm test
```
