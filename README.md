# PromptCraft

Review what coding agents are about to be told, before they run.

Agents are remarkably capable and remarkably literal. A vague prompt leads to
guessing games, missed files, overlong work, and silent stops. PromptCraft checks
a prompt before it is sent, explains what is wrong, scores it, and produces a
stronger version you can send instead.

- **Deterministic first.** A dependency-free rule engine always runs; scores and
  findings come from inspectable heuristics.
- **Model deep review (optional).** When the heuristic score is low, or when
  explicitly asked, a model adds issues and rewrites the prompt. The LLM result
  is additive — it never replaces the heuristic score.
- **No surprise behavior.** Review happens through an explicit
  `/prompt-review` command. PromptCraft never intercepts or rewrites your
  messages automatically.

## Quick start (OpenCode)

The OpenCode plugin is the first adapter. From a published checkout you can use
it immediately:

```sh
npm install -D opencode-promptcraft
```

Or from this repository:

```sh
npm install
npm run build
```

Then add it to your OpenCode config:

```jsonc
// opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-promptcraft",
      "options": {
        "llm": "auto", // "auto" | "always" | "never"
        "llmThreshold": 85
      }
    }
  ]
}
```

For local development, load the built package with a tiny shim in
`.opencode/plugins/promptcraft.ts`:

```ts
export { default } from "/absolute/path/to/PromptCraft/packages/opencode/dist/index.js"
```

Restart OpenCode after changing the plugin list.

### Using it

```
> /prompt-review
Add rate limiting to src/api/login.ts. After 5 failed attempts from the same IP within 10 minutes, return HTTP 429 with a Retry-After header.

> Acceptance criteria:
> - The 6th attempt within the window returns 429
> - The counter resets after 10 minutes
> - npm test passes

> Run /prompt-apply to send the scaffold, or edit your prompt and resend it.
```

`/prompt-apply` sends the generated scaffold through the same session, so your
review history stays where you can see it.

## What a report looks like

For the prompt:

```text
fix the login thing, it's broken, maybe improve it somehow
```

PromptCraft answers with a score, findings, and a scaffold:

```md
## PromptCraft — 31/100 (F)
`████░░░░░░░░  31/100`

### What to fix · 10 issues · 5 high impact

**1. No error output** · high impact
The prompt mentions a failure but does not include the error itself.
→ **Fix:** Paste the exact error message and stack trace, plus the command that produced them.

...

### What already works
- Long enough to carry the request.

### Prompt scaffold
````text
## Task
...
````

## Commands

| Command | What it does |
| --- | --- |
| `/prompt-review <prompt>` | Runs the analysis, stores the last review for the session, posts the report. |
| `/prompt-apply` | Sends the stored scaffold as the next user prompt. |

The commands are plugin options: `reviewCommand` (default `prompt-review`) and
`applyCommand` (default `prompt-apply`).

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `llm` | `"auto"` | When to run the model review. |
| `model` | selected OpenCode model | Model for the deep review. |
| `reviewCommand` | `"prompt-review"` | Slash command used to review. |
| `applyCommand` | `"prompt-apply"` | Slash command used to apply the scaffold. |
| `llmThreshold` | `85` | Heuristic score under which `auto` runs the model. |
| `maxFindings` | `8` | Findings printed per report. |
| `immediate` | `false` | Advertise the report via a synthetic message immediately instead of queueing it for the next turn. Costs one assistant turn per report; default is to keep review turns out of the session. |

### About `immediate`

OpenCode has no display-only transcript message, so a plugin cannot print
something to the conversation without admitting it into the session, which starts
an assistant turn. PromptCraft therefore queues reports (`resume: false`) and
lets them appear with the next turn in the session. Set `immediate: true` if you
prefer to see the report immediately; the report is then prefixed with a
display-only instruction so the following turn stays informational.

## How the score is computed

Scoring is weighted rule coverage over the rules that apply to the prompt:

```
score = 100 * (1 - failedWeight / applicableWeight)
```

| Grade | Score |
| --- | --- |
| A | 90+ |
| B | 80–89 |
| C | 65–79 |
| D | 50–64 |
| F | < 50 |

## The rules

The built-in set covers context, clarity, verification, scope, and noise. Each
rule explains itself in the report (`detail` + `fix`) and is weighted in scoring.

| Area | Rule | Weight | Check |
| --- | --- | --- | --- |
| Context | `no-error-details` — No error output | 10 | bug reports paste the failure |
| Context | `too-short` — Too little to work with | 9 | prompt is substantive |
| Context | `no-context` — No code or file context | 9 | file / snippet / error / URL |
| Context | `no-reproduction` — No reproduction steps | 8 | bug reports |
| Context | `no-current-vs-expected` — Current vs expected | 6 | bug / refactor |
| Context | `no-environment` — No environment details | 3 | bug / setup |
| Clarity | `vague-task` — Vague goal | 8 | quality words |
| Clarity | `ambiguous-reference` — Ambiguous reference | 7 | pronouns / bare nouns |
| Clarity | `no-task-verb` — No requested action | 4 | action verb |
| Clarity | `question-without-intent` — Question without deliverable | 4 | questions |
| Verification | `no-acceptance` — No acceptance criteria | 8 | code tasks |
| Verification | `no-verification` — No verification step | 5 | code tasks |
| Verification | `no-output-format` — Unspecified output format | 4 | review / docs / question |
| Scope | `multi-task` — Too many tasks at once | 7 | 4+ actions |
| Scope | `no-constraints` — No boundaries | 5 | feature / refactor / performance / setup |
| Scope | `compound-request` — Compound request | 4 | multi-verb sentence |
| Scope | `too-long` — Buried request | 3 | > 400 words |
| Noise | `hedging` — Hedged requirements | 3 | maybe / if possible |
| Noise | `shouting` — Shouting | 2 | caps / emphasis |
| Noise | `filler` — Politeness padding | 1 | pleasantries |

## Architecture

```text
prompt  ──▶  features  ──▶  rules ──▶  findings ──▶ score ──▶ report + scaffold
   │                                                              │
   └── adapter ──▶  LLM review (optional, additive) ◀─────────┘
```

- `@promptcraft/core` — framework-agnostic engine. Zero runtime dependencies.
  Emits ESM TypeScript that NodeNext adapters can import directly.
- Adapters — OpenCode today; Codex and others later. Adapters implement a small
  provider interface and decide how the report is surfaced.

Core exports: `analyze`, `analyzePrompt`, `gradeFor`, `extractFeatures`,
`buildImprovedPrompt`, `formatReport`, `formatSummary`, `parseLlmReview`,
`reviewPrompt`, `defaultRules`.

## Adding an adapter

```ts
import { analyze, formatReport } from "@promptcraft/core"

const analysis = await analyze(prompt, {
  llm: provider, // your agent-client-backed LlmProvider, or undefined
  llmMode: "auto", // "never" | "auto" | "always"
  llmThreshold: 85,
})

// analysis.score (0-100), analysis.grade, analysis.findings,
// analysis.strengths, analysis.improvedPrompt, analysis.llm
```

## Development

```sh
npm run build    # tsc -b
npm test         # vitest run
npm run typecheck
```

## Limitations & roadmap

- Rules are heuristic and English-first; no repo-awareness yet (rules cannot read
  your files, they only see the prompt text).
- No automatic interception: the command is deliberately explicit.
- Adapters for Codex, Claude Code, and CLI are planned but not shipped.
- Model reviews use a generic JSON contract; provider-specific behaviour still
  needs verification per agent.
- Report delivery uses OpenCode's synthetic message mechanism; behavior differs
  between OpenCode versions.

## License

MIT
