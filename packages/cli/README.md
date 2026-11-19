# `@promptcraft/cli` — PromptCraft from any harness

The shared command-line entrypoint and harness installer. It wraps the
dependency-free `@promptcraft/core` engine, so the report is the same in every
agent.

## Install

The package is not published to npm yet, so install it from a GitHub checkout:

```sh
git clone https://github.com/know120/PromptCraft.git
cd PromptCraft
npm install
npm run build
cd packages/cli
npm link            # puts `promptcraft` on your PATH
promptcraft --version
```

Without `npm link`, run the built entry point directly:

```sh
node /absolute/path/to/PromptCraft/packages/cli/dist/cli.js review "fix the login thing, it's broken"
```

Once `@promptcraft/cli` is published, `npm install -g @promptcraft/cli` and
`npx -y @promptcraft/cli` are equivalent.

## Review

```sh
promptcraft review "add rate limiting to src/api/login.ts"
promptcraft review --input prompt.txt
promptcraft review --json < prompt.txt
promptcraft review --summary "fix login"
promptcraft review --suggest "fix login"
```

With no prompt argument the CLI reads stdin, which is convenient for heredocs:

```sh
promptcraft review <<'PROMPTCRAFT'
Add rate limiting to src/api/login.ts. After 5 failed attempts from the same IP
within 10 minutes, return HTTP 429 with a Retry-After header.
PROMPTCRAFT
```

| Option | Effect |
| --- | --- |
| `--text <prompt>` | Pass the prompt as a flag (useful in scripts). |
| `--input <file>` | Read the prompt from a file. |
| `--json` | Print the full analysis as JSON. |
| `--summary` | Print a one-line verdict. |
| `--suggest` | Print only the suggested better prompt. `--scaffold` is an alias. |
| `--max-findings <n>` | Findings shown in the report (default 8). |

Exit codes: `0` for a completed review (including a low score), `2` for usage
errors, `1` for unexpected failures.

## Install wrappers

```sh
promptcraft install --list
promptcraft install codex --global
promptcraft install claude gemini cursor
promptcraft install copilot
promptcraft install all --dir .
```

Supported harnesses: `codex`, `claude`, `gemini`, `cursor`, `copilot`.

| Harness | Default location | Invocation |
| --- | --- | --- |
| Codex | `.agents/skills/promptcraft` | `$promptcraft` or `/skills` |
| Claude Code | `.claude/commands` | `/prompt-review` |
| Gemini CLI | `.gemini/commands` | `/prompt-review` |
| Cursor | `.cursor/commands` | `/prompt-review` |
| Copilot | `.github/prompts` | `/prompt-review` |

`--global` installs in the user-wide location where the harness documents one.
`--cli <command>` sets the command written into the wrapper; the default is
`promptcraft`, and `"npx -y @promptcraft/cli"` is the usual alternative.
`--force` overwrites existing files.

## Print instead of install

```sh
promptcraft print codex
promptcraft print claude
```

Useful for harnesses that are not supported yet, or for reviewing a wrapper
before writing it.

## Development

```sh
npm run build
npm test
```
