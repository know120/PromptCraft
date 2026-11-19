---
name: prompt-review
description: Review a prompt with PromptCraft before sending it
---

Review the prompt the user typed after this command with PromptCraft. Do not implement the task — only critique the prompt.

1. Take the text after `/prompt-review` exactly as written. If there is none, ask for a prompt and stop.
2. Run the engine once and capture its output:

```sh
{{CLI}} review <<'PROMPTCRAFT'
<the prompt under review>
PROMPTCRAFT
```

3. Paste the report verbatim. Do not paraphrase it, rescore it, or add findings of your own.
4. Do not start the task described in the prompt.
5. If the user asks to apply the result, send the `### Prompt scaffold` block from the report as your next message, unchanged.
