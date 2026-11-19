---
name: prompt-review
description: Review a prompt with PromptCraft before sending it
argument-hint: [prompt]
---

Review the prompt the user supplied with PromptCraft. Do not implement the task — only critique the prompt.

Prompt:

${input:prompt:Paste the prompt you want reviewed}

1. If the prompt is empty, ask for one and stop.
2. Write the prompt exactly as given to a temporary file.
3. Run `{{CLI}} review --input <temporary file>` once and capture its output.
4. Paste the report verbatim. Do not paraphrase it, rescore it, or add findings of your own.
5. Do not start the task described in the prompt.
6. If the report has a `### Suggested prompt`, end by offering it: "This report includes a suggested prompt — say apply and I will send it."
7. If the user asks to apply the result, send the `### Suggested prompt` block from the report as your next message, unchanged.
