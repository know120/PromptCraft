import type { Rule } from "../types.js"
import { excerpt, hasType, isCodeTask } from "./helpers.js"

/** No definition of done. */
export const noAcceptance: Rule = {
  id: "no-acceptance",
  category: "verification",
  title: "No acceptance criteria",
  description:
    "Without a definition of done, any output can be argued to satisfy the prompt and the agent cannot tell when to stop.",
  weight: 8,
  severity: "error",
  strength: "Defines what done looks like.",
  applies: (features) => isCodeTask(features) && !hasType(features, "test"),
  detect: (features) => {
    if (features.hasAcceptanceCriteria) return null
    return {
      detail: "There is no definition of done, so success is left to interpretation.",
      fix: "Add a \"Done when\" checklist: the observable behaviour plus the command that proves it.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** No check named. */
export const noVerification: Rule = {
  id: "no-verification",
  category: "verification",
  title: "No verification step",
  description:
    "Naming the test or build command is the cheapest way to stop a change that compiles from being called finished.",
  weight: 5,
  severity: "warn",
  strength: "Names how the change will be verified.",
  applies: (features) => isCodeTask(features) && !hasType(features, "test"),
  detect: (features) => {
    if (features.hasVerification) return null
    return {
      detail: "Nothing says how the change should be verified.",
      fix: "Name the check to run (`npm test`, `pytest -q`, `cargo test`) and require it to pass.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** Review/explain requests with no shape for the answer. */
export const noOutputFormat: Rule = {
  id: "no-output-format",
  category: "output",
  title: "Unspecified output format",
  description:
    "For review and explanation requests the shape of the answer matters as much as its content. Without it you get an essay.",
  weight: 4,
  severity: "warn",
  strength: "Specifies the shape of the answer.",
  applies: (features) => hasType(features, "review", "docs", "question"),
  detect: (features) => {
    if (features.hasOutputFormat) return null
    return {
      detail: "The shape of the answer is unspecified.",
      fix: "Say what you want back: a short list, a table, a diff, or file-by-file notes.",
      evidence: excerpt(features.trimmed),
    }
  },
}
