# Future features

Planned work for PromptCraft, kept here as a reference before implementation.

## Shipped

- **OpenCode adapter** — `/prompt-review <prompt>`, `/prompt-review all`,
  `/prompt-apply`; plugin options (`llm`, `model`, commands, `llmThreshold`,
  `maxFindings`, `immediate`); LLM provider via OpenCode generation.
- **Codex adapter** — `buildCodexPrompt`, `buildCodexReviewPrompt`, and
  `reviewWithCodex`, plus a repository- or user-scoped Codex skill
  (`$promptcraft`) backed by the CLI.
- **CLI and harness installers** — `promptcraft review` with stdin, JSON,
  summary, and scaffold output; `promptcraft install` writes native wrappers for
  Codex, Claude Code, Gemini CLI, Cursor, and GitHub Copilot. See
  `docs/enable-in-any-harness.md`.

## Planned

### 1. Repo-aware context

- Adapters pass file contents / attachments into feature extraction.
- Core grows optional context sources so prompts can be grounded in real code.

### 2. Custom rule packs

- User-supplied JSON rule definitions via config; core already accepts `rules`.

### 3. Review history

- Cross-session review storage/dashboard; per-session storage exists today.

### 4. MCP adapter

- Expose prompt review as a tool for other agents (MCP), using the shared core.
- Would give any MCP-capable harness the same review without a shell command.

### 5. IDE integrations

- VS Code / JetBrains prompt-review surfaces.

## Open questions

- Whether model reviews should ever replace heuristics (currently additive only).
- How much weight personalization should have as rules accumulate.
- Whether CLI wrappers should offer an opt-in model review once a provider can be
  configured without an agent-specific SDK.
