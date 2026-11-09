# Future features

Planned work for PromptCraft, kept here as a reference before implementation.

## Shipped

- **OpenCode adapter** — `/prompt-review <prompt>`, `/prompt-review all`, `/prompt-apply`; plugin options (`llm`, `model`, commands, `llmThreshold`, `maxFindings`, `immediate`); LLM provider via OpenCode generation.

## Planned

### 1. Codex adapter (next)

- Thin adapter over the same core, mirroring the OpenCode adapter's surface:
  - prompt formatting for Codex instruction/context/task layout,
  - `LlmProvider` implementation for Codex's model backend,
  - review command + apply flow, if Codex exposes a plugin/command surface.
- Blocked on: confirmed Codex CLI plugin/command API.

### 2. CLI

- `promptcraft review "<prompt>"` — deterministic + optional LLM review.
- `promptcraft review --session <id>` — reuse the session-wide logic.
- JSON output for CI.

### 3. Repo-aware context

- Adapters pass file contents / attachments into feature extraction.
- Core grows optional context sources so prompts can be grounded in real code.

### 4. Custom rule packs

- User-supplied JSON rule definitions via config; core already accepts `rules`.

### 5. Review history

- Cross-session review storage/dashboard; per-session storage exists today.

### 6. MCP adapter

- Expose prompt review as a tool for other agents (MCP), using the shared core.

### 7. IDE integrations

- VS Code / JetBrains prompt-review surfaces.

## Open questions

- Whether model reviews should ever replace heuristics (currently additive only).
- How much weight personalization should have as rules accumulate.
