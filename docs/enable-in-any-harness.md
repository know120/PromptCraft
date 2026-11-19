# Enable PromptCraft in any coding harness

PromptCraft is one deterministic review engine with thin wrappers per agent.
The wrappers only decide *where* the slash command lives and *how* it invokes
the engine. The review itself is identical everywhere.

There are two integration styles:

| Style | Harnesses | What you get |
| --- | --- | --- |
| Native plugin | OpenCode | `/prompt-review`, `/prompt-review all`, `/prompt-apply`, optional model review via the selected OpenCode model. |
| CLI wrapper | Codex, Claude Code, Gemini CLI, Cursor, Copilot, anything with a shell | A command or skill that runs `promptcraft review` and shows the report. Deterministic only. |

## 1. Install the CLI

```sh
npm install -g @promptcraft/cli
promptcraft --version
```

If you do not want a global install, run it through `npx` and write that same
command into the wrappers:

```sh
npx -y @promptcraft/cli review "fix the login thing, it's broken"
npx -y @promptcraft/cli install codex --cli "npx -y @promptcraft/cli"
```

From this repository:

```sh
npm install
npm run build
node packages/cli/dist/cli.js review "fix the login thing, it's broken"
```

Use `--cli "node /absolute/path/to/packages/cli/dist/cli.js"` when installing
wrappers from a source checkout.

### What the CLI can do

```sh
promptcraft review "add rate limiting to src/api/login.ts"
promptcraft review --input prompt.txt
promptcraft review --json < prompt.txt
promptcraft review --summary "fix login"
promptcraft review --scaffold "fix login"
```

| Command / option | Effect |
| --- | --- |
| `review [prompt]` | Print the Markdown report. Reads stdin when no prompt is given. |
| `--input <file>` | Read the prompt from a file. |
| `--json` | Print the full analysis (score, grade, findings, features, scaffold). |
| `--summary` | Print one line: `PromptCraft 31/100 (F) · top issue: ...`. |
| `--scaffold` | Print only the improved prompt, ready to send. |
| `--max-findings <n>` | Findings shown in the report (default 8). |
| `install [harness]` | Write the wrapper files for a harness. |
| `print <harness>` | Print the wrapper files instead of writing them. |

`review` exits `0` even when the score is low, so a session is never blocked by
a bad prompt. For CI, parse `--json` and enforce your own threshold:

```sh
promptcraft review --json < prompt.txt | jq -e '.score >= 85'
```

## 2. Install a wrapper

```sh
promptcraft install --list
promptcraft install codex --global     # user-wide Codex skill
promptcraft install claude --global    # user-wide Claude Code command
promptcraft install gemini cursor      # in the current project
promptcraft install copilot            # in the current project
promptcraft install all --dir .        # every wrapper, project-scoped
```

By default files go into the current project so they can be reviewed and
committed. `--global` uses the user-wide location instead. Existing files are
left alone unless you add `--force`.

`--cli <command>` controls what the wrapper executes. The default is
`promptcraft`; use `--cli "npx -y @promptcraft/cli"` when the binary is not on
`PATH`.

## 3. Harness by harness

### Codex

Codex uses **skills**; custom prompts under `~/.codex/prompts` were removed in
March 2026. The installer writes a skill that invokes the CLI and pastes its
report:

```sh
promptcraft install codex --global
```

That creates:

```text
~/.agents/skills/promptcraft/
├── SKILL.md
└── agents/openai.yaml
```

For a repository-scoped skill, omit `--global`; Codex scans `.agents/skills`
from the working directory up to the repository root, so committing it shares
the command with everyone on the project.

Use it by mentioning the skill explicitly:

```text
$promptcraft
Add rate limiting to src/api/login.ts. After 5 failed attempts from the same IP
within 10 minutes, return HTTP 429 with a Retry-After header.
```

Or type `/skills`, pick **PromptCraft**, and supply the prompt. Implicit
invocation is disabled on purpose: PromptCraft should never take over an
ordinary request.

After the report, ask Codex to apply it and the skill sends the scaffold as
your next message.

Codex reads skill changes automatically; restart it if the skill does not show
up. The old `~/.codex/skills` folder is legacy; use `~/.agents/skills`.

### OpenCode

OpenCode uses the native plugin, not the CLI wrapper. Add it to
`opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-promptcraft",
      "options": {
        "llm": "auto",
        "llmThreshold": 85
      }
    }
  ]
}
```

Then use `/prompt-review <prompt>`, `/prompt-review all`, and `/prompt-apply`.
See [`packages/opencode/README.md`](../packages/opencode/README.md) for options
and report delivery.

The plugin is the only path that supports a model deep review and whole-session
reviews today. If you prefer the generic CLI wrapper, create an OpenCode
command that asks the agent to run `promptcraft review --input`, but you lose
those features.

### Claude Code

```sh
promptcraft install claude --global   # ~/.claude/commands/prompt-review.md
promptcraft install claude            # .claude/commands/prompt-review.md
```

Restart Claude Code and run:

```text
/prompt-review Add rate limiting to src/api/login.ts
```

The command uses `$ARGUMENTS`, runs the CLI through a quoted heredoc, and tells
Claude to paste the report without implementing the task.

### Gemini CLI

```sh
promptcraft install gemini --global   # ~/.gemini/commands/prompt-review.toml
promptcraft install gemini            # .gemini/commands/prompt-review.toml
```

Reload commands inside Gemini CLI:

```text
/commands reload
/prompt-review Add rate limiting to src/api/login.ts
```

The TOML command uses Gemini's `!{ ... }` shell injection, so the report is
produced before the model responds; `{{args}}` is shell-escaped by Gemini.

### Cursor

```sh
promptcraft install cursor --global   # ~/.cursor/commands/prompt-review.md
promptcraft install cursor            # .cursor/commands/prompt-review.md
```

Reload Cursor, then run `/prompt-review <prompt>` in Agent chat. Cursor passes
text after the command name to the agent as extra context; the command tells the
agent to run the CLI and paste the output.

### GitHub Copilot

```sh
promptcraft install copilot   # .github/prompts/prompt-review.prompt.md
```

In VS Code Chat, run `/prompt-review` and fill in the prompt field. Copilot
prompt files are workspace-scoped, so there is no `--global` form. Support in
other Copilot surfaces is limited; use the generic block below where prompt
files are unavailable.

### Anything else with a shell

Ask the agent to run the CLI with the prompt on stdin. A reusable instruction
for `AGENTS.md`, `CLAUDE.md`, or any system prompt:

```md
## PromptCraft

When I ask you to review a prompt, do not implement it. Run:

    promptcraft review <<'PROMPTCRAFT'
    <the prompt, exactly as written>
    PROMPTCRAFT

Paste the report verbatim. If I ask to apply it, send the `### Prompt scaffold`
block back as my next message, unchanged.
```

You can print the exact files the installer would write with:

```sh
promptcraft print codex
promptcraft print claude
promptcraft print gemini
promptcraft print cursor
promptcraft print copilot
```

## How every wrapper behaves

All CLI wrappers follow the same contract:

1. **Review only.** The agent must not start the task while reviewing it.
2. **Verbatim report.** The agent must not paraphrase, rescore, or add findings.
3. **Apply separately.** "Apply" sends the `### Prompt scaffold` block as the
   next user message, so the implementation turn starts from a real prompt.
4. **Deterministic by default.** CLI wrappers do not call a model. The scoring
   and findings come from the shared rule engine.

## Troubleshooting

- **`promptcraft: command not found`** — install the package globally, use
  `npx -y @promptcraft/cli`, or reinstall the wrapper with
  `--cli "node /absolute/path/to/packages/cli/dist/cli.js"`.
- **Command missing after install** — restart the harness. Codex, Claude Code
  and Cursor load wrappers at startup; Gemini has `/commands reload`.
- **The agent implemented the task instead of reviewing** — make sure the
  wrapper still contains the "Do not implement the task" instruction. Reinstall
  with `--force`.
- **Files already exist** — the installer never overwrites without `--force`.
- **`--global` is rejected for Copilot** — Copilot prompt files are
  workspace-scoped; install into the repository.
