#!/usr/bin/env node
import { realpathSync } from "node:fs"
import { readFile } from "node:fs/promises"
import process from "node:process"
import type { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import { analyze, formatReport, formatSummary } from "@promptcraft/core"
import {
  DEFAULT_CLI,
  HARNESSES,
  describeHarnesses,
  installHarness,
  isHarness,
  renderTemplate,
  type Harness,
  type InstallResult,
} from "./install.js"

export class UsageError extends Error {}

export type Command =
  | {
      name: "review"
      text?: string
      input?: string
      json: boolean
      suggest: boolean
      summary: boolean
      maxFindings?: number
      help: boolean
    }
  | {
      name: "install"
      harnesses: Harness[]
      list: boolean
      global: boolean
      force: boolean
      root?: string
      cli: string
      help: boolean
    }
  | { name: "print"; harness: Harness; cli: string }
  | { name: "help" }
  | { name: "version" }

const HELP = `PromptCraft — review a prompt before a coding agent runs it.

Usage:
  promptcraft review [prompt] [options]
  promptcraft install [harness ...] [options]
  promptcraft print <harness> [--cli <command>]

Review options:
  --text <prompt>       Prompt to review (useful for scripts)
  --input <file>        Read the prompt from a file
  --json                Print the raw analysis as JSON
  --suggest             Print only the suggested better prompt
  --scaffold            Alias for --suggest (kept for compatibility)
  --summary             Print a one-line verdict
  --max-findings <n>    Findings shown in the report (default 8)
  --help                Show this help

With no --text, --input, or positional prompt, review reads stdin:
  promptcraft review <<'PROMPTCRAFT'
  add rate limiting to src/api/login.ts
  PROMPTCRAFT

Install options:
  --global              Install in the current user's home directory
  --dir <path>          Project root (default: current directory)
  --cli <command>       Command written into wrappers (default: ${DEFAULT_CLI})
  --force               Overwrite wrapper files that already exist
  --list                List supported harnesses

Harnesses: ${HARNESSES.join(", ")}

Examples:
  promptcraft review "fix the login thing, it's broken"
  promptcraft install codex --global
  promptcraft install claude gemini cursor --dir .
  promptcraft install copilot --cli "npx -y @promptcraft/cli"
`

/** Parse CLI arguments into a command. Exported for tests. */
export function parseArgs(argv: readonly string[]): Command {
  const first = argv[0]

  if (!first) return { name: "help" }
  if (first === "help" || first === "--help" || first === "-h") {
    return { name: "help" }
  }
  if (first === "--version" || first === "-v" || first === "version") {
    return { name: "version" }
  }
  if (first === "install") return parseInstall(argv.slice(1))
  if (first === "print") return parsePrint(argv.slice(1))

  if (first.startsWith("-")) return parseReview(argv)
  if (first === "review") return parseReview(argv.slice(1))
  return parseReview(argv)
}

function parseReview(argv: readonly string[]): Command {
  const command: Extract<Command, { name: "review" }> = {
    name: "review",
    json: false,
    suggest: false,
    summary: false,
    help: false,
  }
  const positional: string[] = []
  let flags = true

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (flags && arg === "--") {
      flags = false
      continue
    }
    if (!flags || !arg.startsWith("-") || arg === "-") {
      positional.push(arg)
      continue
    }
    switch (arg) {
      case "--json":
        command.json = true
        break
      case "--suggest":
        command.suggest = true
        break
      case "--scaffold":
        command.suggest = true
        break
      case "--summary":
        command.summary = true
        break
      case "--help":
      case "-h":
        command.help = true
        break
      case "--text": {
        const value = argv[index + 1]
        if (value === undefined) throw new UsageError("--text needs a value")
        command.text = value
        index += 1
        break
      }
      case "--input": {
        const value = argv[index + 1]
        if (value === undefined) throw new UsageError("--input needs a path")
        command.input = value
        index += 1
        break
      }
      case "--max-findings": {
        const value = argv[index + 1]
        if (value === undefined) throw new UsageError("--max-findings needs a number")
        const parsed = Number(value)
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new UsageError("--max-findings must be a non-negative integer")
        }
        command.maxFindings = parsed
        index += 1
        break
      }
      default:
        throw new UsageError(`unknown option: ${arg}`)
    }
  }

  if (positional.length > 0) command.text = positional.join(" ")
  return command
}

function parseInstall(argv: readonly string[]): Command {
  const command: Extract<Command, { name: "install" }> = {
    name: "install",
    harnesses: [],
    list: false,
    global: false,
    force: false,
    cli: process.env.PROMPTCRAFT_CLI?.trim() || DEFAULT_CLI,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    switch (arg) {
      case "--global":
        command.global = true
        break
      case "--project":
        command.global = false
        break
      case "--force":
        command.force = true
        break
      case "--list":
        command.list = true
        break
      case "--help":
      case "-h":
        command.help = true
        break
      case "--dir": {
        const value = argv[index + 1]
        if (value === undefined) throw new UsageError("--dir needs a path")
        command.root = value
        index += 1
        break
      }
      case "--cli": {
        const value = argv[index + 1]
        if (value === undefined) throw new UsageError("--cli needs a command")
        command.cli = value
        index += 1
        break
      }
      default:
        if (arg.startsWith("-")) throw new UsageError(`unknown option: ${arg}`)
        if (arg === "all") {
          command.harnesses.push(...HARNESSES)
          continue
        }
        if (!isHarness(arg)) {
          throw new UsageError(`unknown harness: ${arg} (expected ${HARNESSES.join(", ")})`)
        }
        command.harnesses.push(arg)
    }
  }

  if (command.harnesses.length === 0) command.harnesses.push("codex")
  command.harnesses = [...new Set(command.harnesses)]
  return command
}

function parsePrint(argv: readonly string[]): Command {
  const harness = argv[0]
  if (!harness) throw new UsageError(`print needs a harness (${HARNESSES.join(", ")})`)
  if (!isHarness(harness)) throw new UsageError(`unknown harness: ${harness}`)
  let cli = process.env.PROMPTCRAFT_CLI?.trim() || DEFAULT_CLI
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] !== "--cli") throw new UsageError(`unknown option: ${argv[index]}`)
    const value = argv[index + 1]
    if (value === undefined) throw new UsageError("--cli needs a command")
    cli = value
    index += 1
  }
  return { name: "print", harness, cli }
}

interface Io {
  stdin: Readable & { isTTY?: boolean }
  stdout: (text: string) => void
  stderr: (text: string) => void
}

const defaultIo: Io = {
  stdin: process.stdin,
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
}

async function readStdin(io: Io): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of io.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  }
  return Buffer.concat(chunks).toString("utf8")
}

function serializeAnalysis(analysis: Awaited<ReturnType<typeof analyze>>): string {
  return JSON.stringify(
    {
      prompt: analysis.prompt,
      score: analysis.score,
      grade: analysis.grade,
      findings: analysis.findings,
      strengths: analysis.strengths,
      features: analysis.features,
      improvedPrompt: analysis.improvedPrompt,
      llm: analysis.llm,
      llmError: analysis.llmError,
    },
    null,
    2,
  )
}

function formatInstall(result: InstallResult): string {
  const lines = [`PromptCraft installed for ${result.harness} in ${result.root}`]
  for (const file of result.files) {
    lines.push(`  ${file.status.padEnd(9)} ${file.path}`)
  }
  const skipped = result.files.filter((file) => file.status === "skipped")
  if (skipped.length > 0) {
    lines.push("", "Some files already existed. Re-run with --force to replace them.")
  }
  lines.push(...nextSteps(result.harness))
  return lines.join("\n")
}

function nextSteps(harness: Harness): string[] {
  switch (harness) {
    case "codex":
      return ["", "Restart Codex, then run `$promptcraft` (or `/skills`) to review a prompt."]
    case "claude":
      return ["", "Restart Claude Code, then run `/prompt-review <prompt>`."]
    case "gemini":
      return ["", "Run `/commands reload` in Gemini CLI, then `/prompt-review <prompt>`."]
    case "cursor":
      return ["", "Reload Cursor, then run `/prompt-review <prompt>` in Agent chat."]
    case "copilot":
      return ["", "In VS Code Chat, run `/prompt-review <prompt>`."]
  }
}

async function version(): Promise<string> {
  const raw = await readFile(new URL("../package.json", import.meta.url), "utf8")
  const parsed = JSON.parse(raw) as { version?: string }
  return parsed.version ?? "0.0.0"
}

/** Run the CLI. Returns a process exit code. Exported for tests. */
export async function main(argv: readonly string[] = process.argv.slice(2), io: Io = defaultIo): Promise<number> {
  try {
    const command = parseArgs(argv)

    switch (command.name) {
      case "help":
        io.stdout(HELP.trimEnd())
        return 0
      case "version":
        io.stdout(await version())
        return 0
      case "print": {
        const blocks: string[] = []
        const files =
          command.harness === "codex" ? ["SKILL.md", "agents/openai.yaml"] : undefined
        const names = files ?? [templateName(command.harness)]
        for (const file of names) {
          blocks.push(`# ${command.harness}/${file}`, await renderTemplate(command.harness, file, command.cli))
        }
        io.stdout(blocks.join("\n"))
        return 0
      }
      case "install": {
        if (command.help) {
          io.stdout(HELP.trimEnd())
          return 0
        }
        if (command.list) {
          io.stdout(describeHarnesses())
          return 0
        }
        if (command.global && command.root) {
          throw new UsageError("--global and --dir cannot be used together")
        }
        if (command.global && command.harnesses.includes("copilot")) {
          throw new UsageError("copilot prompt files are project-scoped; drop --global")
        }
        const results: InstallResult[] = []
        for (const harness of command.harnesses) {
          results.push(
            await installHarness(harness, {
              root: command.root,
              global: command.global,
              force: command.force,
              cli: command.cli,
            }),
          )
        }
        io.stdout(results.map(formatInstall).join("\n\n"))
        return 0
      }
      case "review": {
        if (command.help) {
          io.stdout(HELP.trimEnd())
          return 0
        }
        if (command.text !== undefined && command.input !== undefined) {
          throw new UsageError("use either --text or --input, not both")
        }

        let text = command.text
        if (text === undefined && command.input !== undefined) {
          text = await readFile(command.input, "utf8")
        }
        if (text === undefined) {
          if (io.stdin.isTTY) {
            throw new UsageError("no prompt provided (pass a prompt, --input <file>, or pipe stdin)")
          }
          text = await readStdin(io)
        }

        const prompt = text.trim()
        if (!prompt) throw new UsageError("the prompt is empty")

        const analysis = await analyze(prompt)
        if (command.json) io.stdout(serializeAnalysis(analysis))
        else if (command.summary) io.stdout(formatSummary(analysis))
        else if (command.suggest) {
          io.stdout(analysis.llm?.rewrittenPrompt ?? analysis.improvedPrompt)
        } else {
          io.stdout(
            formatReport(analysis, {
              maxFindings: command.maxFindings,
              footer:
                analysis.findings.length > 0
                  ? "Send the suggested prompt above instead of your original, or edit it first."
                  : undefined,
            }),
          )
        }
        return 0
      }
    }
    return 0
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`promptcraft: ${error.message}`)
      io.stderr("Run `promptcraft --help` for usage.")
      return 2
    }
    io.stderr(`promptcraft: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

function templateName(harness: Harness): string {
  switch (harness) {
    case "codex":
      return "SKILL.md"
    case "claude":
    case "cursor":
      return "prompt-review.md"
    case "gemini":
      return "prompt-review.toml"
    case "copilot":
      return "prompt-review.prompt.md"
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isDirectRun()) {
  void main().then((code) => {
    process.exitCode = code
  })
}
