import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** Harnesses with a known command/prompt surface we can install into. */
export const HARNESSES = ["codex", "claude", "gemini", "cursor", "copilot"] as const

export type Harness = (typeof HARNESSES)[number]

export function isHarness(value: string): value is Harness {
  return (HARNESSES as readonly string[]).includes(value)
}

interface HarnessSpec {
  /** Folder, relative to the project root, that the harness scans. */
  project: string
  /** Folder, relative to `$HOME`, for a user-wide install. */
  global?: string
  /** Files copied from the harness template folder. */
  files: readonly string[]
  /** One-line description shown by `promptcraft install --list`. */
  summary: string
}

const SPECS: Record<Harness, HarnessSpec> = {
  codex: {
    project: ".agents/skills/promptcraft",
    global: ".agents/skills/promptcraft",
    files: ["SKILL.md", "agents/openai.yaml"],
    summary: "Codex skill, invoked as $promptcraft",
  },
  claude: {
    project: ".claude/commands",
    global: ".claude/commands",
    files: ["prompt-review.md"],
    summary: "Claude Code command, invoked as /prompt-review",
  },
  gemini: {
    project: ".gemini/commands",
    global: ".gemini/commands",
    files: ["prompt-review.toml"],
    summary: "Gemini CLI command, invoked as /prompt-review",
  },
  cursor: {
    project: ".cursor/commands",
    global: ".cursor/commands",
    files: ["prompt-review.md"],
    summary: "Cursor command, invoked as /prompt-review",
  },
  copilot: {
    project: ".github/prompts",
    files: ["prompt-review.prompt.md"],
    summary: "GitHub Copilot prompt file, invoked as /prompt-review",
  },
}

/** Default CLI invocation written into installed templates. */
export const DEFAULT_CLI = "promptcraft"

export interface InstallOptions {
  /** Project root for the install. Defaults to the current working directory. */
  root?: string
  /** Install under `$HOME` instead of the project. */
  global?: boolean
  /** Overwrite files that already exist. */
  force?: boolean
  /** Command that runs the PromptCraft CLI, e.g. `npx -y @promptcraft/cli`. */
  cli?: string
}

export type InstallStatus = "created" | "updated" | "unchanged" | "skipped"

export interface InstalledFile {
  path: string
  status: InstallStatus
}

export interface InstallResult {
  harness: Harness
  root: string
  files: InstalledFile[]
}

/** Absolute path of the template folder shipped with this package. */
export function templateRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "templates")
}

/** Read one template file and substitute the CLI command. */
export async function renderTemplate(
  harness: Harness,
  file: string,
  cli = DEFAULT_CLI,
): Promise<string> {
  const path = resolve(templateRoot(), harness, file)
  const text = await readFile(path, "utf8")
  return text.replaceAll("{{CLI}}", cli)
}

/** Where a harness's files land for the given options. */
export function installRoot(harness: Harness, options: InstallOptions = {}): string {
  const spec = SPECS[harness]
  if (options.global) {
    if (!spec.global) {
      throw new Error(
        `${harness} has no documented user-wide location; install it in a project instead.`,
      )
    }
    return resolve(homedir(), spec.global)
  }
  return resolve(options.root ?? process.cwd(), spec.project)
}

/** Install PromptCraft's wrapper files for one harness. */
export async function installHarness(
  harness: Harness,
  options: InstallOptions = {},
): Promise<InstallResult> {
  const spec = SPECS[harness]
  const cli = (options.cli ?? DEFAULT_CLI).trim()
  if (!cli) throw new Error("--cli must not be empty")

  const root = installRoot(harness, options)
  const files: InstalledFile[] = []

  for (const file of spec.files) {
    const destination = resolve(root, file)
    const content = await renderTemplate(harness, file, cli)

    let existing: string | undefined
    try {
      existing = await readFile(destination, "utf8")
    } catch {
      existing = undefined
    }

    if (existing === content) {
      files.push({ path: destination, status: "unchanged" })
      continue
    }
    if (existing !== undefined && !options.force) {
      files.push({ path: destination, status: "skipped" })
      continue
    }

    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, content, "utf8")
    files.push({ path: destination, status: existing === undefined ? "created" : "updated" })
  }

  return { harness, root, files }
}

/** Human-readable list of installable harnesses. */
export function describeHarnesses(): string {
  return HARNESSES.map((harness) => {
    const spec = SPECS[harness]
    return `${harness.padEnd(8)} ${spec.summary}${spec.global ? "" : " (project only)"}`
  }).join("\n")
}
