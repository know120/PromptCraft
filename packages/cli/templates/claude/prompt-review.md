---
description: Review a prompt with PromptCraft before sending it
argument-hint: [prompt]
---

Review the prompt below with PromptCraft. Do not implement it — this command only critiques the prompt.

Prompt:

$ARGUMENTS

If the prompt is empty, ask for one and stop.

Run the engine once and paste its output verbatim:

```sh
{{CLI}} review <<'PROMPTCRAFT'
$ARGUMENTS
PROMPTCRAFT
```

Then:

1. Do not paraphrase, rescore, or add findings of your own.
2. Do not start the task described in the prompt.
3. If the report has a `### Suggested prompt`, end by offering it: "This report includes a suggested prompt — say apply and I will send it."
4. If the user asks to apply the result, send the `### Suggested prompt` block from the report as your next message, unchanged.
