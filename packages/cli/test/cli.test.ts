import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { afterEach, describe, expect, it } from "vitest"
import { UsageError, main, parseArgs } from "../src/cli.js"
import { installHarness, renderTemplate } from "../src/install.js"

const tempDirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "promptcraft-cli-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("parseArgs", () => {
  it("shows help when no arguments are given", () => {
    expect(parseArgs([])).toEqual({ name: "help" })
  })

  it("treats positional words as the prompt", () => {
    const command = parseArgs(["review", "fix", "the", "login", "flow"])
    expect(command).toMatchObject({ name: "review", text: "fix the login flow" })
  })

  it("parses review flags", () => {
    const command = parseArgs(["review", "--text", "hello", "--json", "--max-findings", "3"])
    expect(command).toMatchObject({ name: "review", text: "hello", json: true, maxFindings: 3 })
  })

  it("defaults install to Codex and de-duplicates harnesses", () => {
    expect(parseArgs(["install"])).toMatchObject({ name: "install", harnesses: ["codex"] })
    expect(parseArgs(["install", "claude", "claude", "gemini"])).toMatchObject({
      name: "install",
      harnesses: ["claude", "gemini"],
    })
  })

  it("rejects unknown options and harnesses", () => {
    expect(() => parseArgs(["review", "--wat"])).toThrow(UsageError)
    expect(() => parseArgs(["install", "emacs"])).toThrow(UsageError)
  })
})

describe("templates", () => {
  it("substitutes the CLI command", async () => {
    const skill = await renderTemplate("codex", "SKILL.md", "npx -y @promptcraft/cli")
    expect(skill).toContain("npx -y @promptcraft/cli review")
    expect(skill).toContain("name: promptcraft")
  })
})

describe("installHarness", () => {
  it("writes a Codex skill and leaves it alone on a second run", async () => {
    const root = await tempDir()
    const first = await installHarness("codex", { root, cli: "promptcraft" })
    expect(first.files.map((file) => file.status)).toEqual(["created", "created"])

    const skill = await readFile(join(root, ".agents/skills/promptcraft/SKILL.md"), "utf8")
    expect(skill).toContain("promptcraft review")

    const second = await installHarness("codex", { root, cli: "promptcraft" })
    expect(second.files.map((file) => file.status)).toEqual(["unchanged", "unchanged"])
  })

  it("skips existing files unless forced", async () => {
    const root = await tempDir()
    const destination = join(root, ".claude/commands/prompt-review.md")
    await installHarness("claude", { root })
    await writeFile(destination, "custom", "utf8")

    const skipped = await installHarness("claude", { root })
    expect(skipped.files[0]?.status).toBe("skipped")

    const forced = await installHarness("claude", { root, force: true, cli: "npx -y @promptcraft/cli" })
    expect(forced.files[0]?.status).toBe("updated")
    expect(await readFile(destination, "utf8")).toContain("npx -y @promptcraft/cli")
  })

  it("rejects a global Copilot install", async () => {
    await expect(installHarness("copilot", { global: true })).rejects.toThrow(/project/)
  })
})

describe("main", () => {
  async function run(argv: string[], stdin = "") {
    const out: string[] = []
    const err: string[] = []
    const code = await main(argv, {
      stdin: Object.assign(Readable.from([stdin]), { isTTY: false }),
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
    })
    return { code, stdout: out.join("\n"), stderr: err.join("\n") }
  }

  it("reviews a prompt from stdin", async () => {
    const result = await run(["review"], "fix the login thing, it's broken")
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("## PromptCraft")
  })

  it("prints JSON when asked", async () => {
    const result = await run(["--json"], "fix the login thing, it's broken")
    expect(result.code).toBe(0)
    const parsed = JSON.parse(result.stdout) as { score: number }
    expect(parsed.score).toBeLessThan(100)
  })

  it("prints only the suggested prompt when asked", async () => {
    const result = await run(["--suggest"], "fix the login thing, it's broken")
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("## Task")

    const legacy = await run(["--scaffold"], "fix the login thing, it's broken")
    expect(legacy.stdout).toBe(result.stdout)
  })

  it("returns a usage error for an empty prompt", async () => {
    const result = await run(["review"], "   ")
    expect(result.code).toBe(2)
    expect(result.stderr).toContain("empty")
  })

  it("rejects a global install that includes Copilot before writing anything", async () => {
    const result = await run(["install", "all", "--global"])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain("project-scoped")
  })
})
