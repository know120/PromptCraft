import { describe, expect, it } from "vitest"
import plugin from "../src/index.js"
import { readOptions } from "../src/options.js"

describe("readOptions", () => {
  it("defaults sessionCommand to prompt-session", () => {
    const opts = readOptions({})
    expect(opts.sessionCommand).toBe("prompt-session")
  })

  it("sanitizes custom sessionCommand", () => {
    const opts = readOptions({ sessionCommand: "/my_session_command" })
    expect(opts.sessionCommand).toBe("my_session_command")
  })

  it("falls back to default if invalid command string", () => {
    const opts = readOptions({ sessionCommand: "   " })
    expect(opts.sessionCommand).toBe("prompt-session")
  })
})

describe("OpenCode PromptCraft plugin", () => {
  function createMockContext(options: Record<string, unknown> = {}, sessionMessages: any[] = []) {
    const commands: Record<string, any> = {}
    const notices: Array<{ sessionID: string; text: string; description: string }> = []
    const prompts: Array<{ sessionID: string; text: string }> = []
    const storageData = new Map<string, any>()

    const ctx = {
      options,
      command: {
        transform: async (callback: (editor: { add: (cmd: any) => void }) => void) => {
          callback({
            add: (cmd: any) => {
              commands[cmd.name] = cmd
            },
          })
        },
      },
      session: {
        synthetic: async (input: { sessionID: string; text: string; description: string }) => {
          notices.push(input)
          return {}
        },
        prompt: async (input: { sessionID: string; text: string }) => {
          prompts.push(input)
          return {}
        },
        context: async ({ sessionID }: { sessionID: string }) => {
          return sessionMessages
        },
        hook: async () => ({ dispose: async () => {} }),
      },
      storage: {
        get: async (key: string) => storageData.get(key),
        set: async (key: string, val: any) => storageData.set(key, val),
        remove: async (key: string) => storageData.delete(key),
      },
    }

    return { ctx, commands, notices, prompts, storageData }
  }

  it("registers session command and review/apply commands", async () => {
    const { ctx, commands } = createMockContext({ llm: "never" })
    await plugin.setup(ctx as any)

    expect(commands["prompt-review"]).toBeDefined()
    expect(commands["prompt-apply"]).toBeDefined()
    expect(commands["prompt-session"]).toBeDefined()
    expect(commands["prompt-review-session"]).toBeDefined()
  })

  it("notices when no user prompts exist in session", async () => {
    const { ctx, commands, notices } = createMockContext({ llm: "never" }, [])
    await plugin.setup(ctx as any)

    await commands["prompt-session"].execute({ sessionID: "s1" })
    expect(notices).toHaveLength(1)
    expect(notices[0]?.text).toContain("No user prompts found in this session yet")
  })

  it("analyzes all user prompts in the session", async () => {
    const messages = [
      {
        id: "m1",
        type: "user",
        text: "fix the login thing, it's broken, maybe improve it somehow",
        time: { created: 1000 },
      },
      {
        id: "m2",
        type: "assistant",
        text: "I am working on it",
        time: { created: 2000 },
      },
      {
        id: "m3",
        type: "user",
        text: "Add rate limiting to `src/api/login.ts`.\nAcceptance criteria:\n- [ ] return 429\n- [ ] npm test passes",
        time: { created: 3000 },
      },
    ]

    const { ctx, commands, notices } = createMockContext({ llm: "never" }, messages)
    await plugin.setup(ctx as any)

    await commands["prompt-session"].execute({ sessionID: "s1" })

    expect(notices).toHaveLength(1)
    expect(notices[0]?.description).toContain("PromptCraft session analysis")
    expect(notices[0]?.text).toContain("## PromptCraft — Session Analysis")
    expect(notices[0]?.text).toContain("2 prompts analyzed")
    expect(notices[0]?.text).toContain("Score trend:")
    expect(notices[0]?.text).toContain("### Prompt breakdown")
  })

  it("ignores promptcraft slash commands when extracting user prompts", async () => {
    const messages = [
      {
        id: "m1",
        type: "user",
        text: "/prompt-session",
        time: { created: 1000 },
      },
      {
        id: "m2",
        type: "user",
        text: "/prompt-review something",
        time: { created: 2000 },
      },
    ]

    const { ctx, commands, notices } = createMockContext({ llm: "never" }, messages)
    await plugin.setup(ctx as any)

    await commands["prompt-session"].execute({ sessionID: "s1" })
    expect(notices[0]?.text).toContain("No user prompts found in this session yet")
  })

  it("triggers session analysis from /prompt-review --session", async () => {
    const messages = [
      {
        id: "m1",
        type: "user",
        text: "Fix `src/auth.ts`: check token expiration.\nDone when tests pass.",
        time: { created: 1000 },
      },
    ]

    const { ctx, commands, notices } = createMockContext({ llm: "never" }, messages)
    await plugin.setup(ctx as any)

    await commands["prompt-review"].execute({
      sessionID: "s1",
      prompt: { text: "--session" },
    })

    expect(notices).toHaveLength(1)
    expect(notices[0]?.text).toContain("Session Analysis")
    expect(notices[0]?.text).toContain("1 prompt analyzed")
  })

  it("prints usage mentioning session command when prompt-review is empty", async () => {
    const { ctx, commands, notices } = createMockContext({ llm: "never" }, [])
    await plugin.setup(ctx as any)

    await commands["prompt-review"].execute({
      sessionID: "s1",
      prompt: { text: "" },
    })

    expect(notices[0]?.text).toContain("Usage: `/prompt-review <your prompt>`")
    expect(notices[0]?.text).toContain("/prompt-session")
  })
})
