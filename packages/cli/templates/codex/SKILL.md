---
name: promptcraft
description: Review a coding-agent prompt before sending it. Use when the user asks to review, critique, score, or improve a prompt, or invokes $promptcraft. Do not use to review code, diffs, pull requests, or finished work.
---

# PromptCraft

PromptCraft reviews the prompt itself, not the task inside it. Run the review, paste the report, and never start the task during a review.

## Review a prompt

1. Take the prompt under review exactly as written. If the user gave no prompt, ask for it.
2. Run the engine once, using a quoted heredoc so the shell does not expand the prompt:

```sh
{{CLI}} review <<'PROMPTCRAFT'
<the prompt under review, exactly as written>
PROMPTCRAFT
```

3. Paste the command output verbatim. Do not paraphrase it, rescore it, or add findings of your own.
4. Do not implement the task. A review is a review, even when the prompt asks for code.

If the command is not found, run the same command through `npx -y @promptcraft/cli`, or tell the user the PromptCraft CLI is missing.

## Apply the improved prompt

When the user asks to apply the result, send the `### Prompt scaffold` block from the report as your next message, unchanged. Do not wrap it in commentary and do not start the task in the same turn.
