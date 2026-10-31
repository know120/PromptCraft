import type { Rule } from "../types.js"
import { excerpt, hasType, isCodeTask } from "./helpers.js"

/** Under-specified by length alone. */
export const tooShort: Rule = {
  id: "too-short",
  category: "context",
  title: "Too little to work with",
  description:
    "A handful of words cannot carry a goal, a location, and a success condition. The agent fills the gaps with assumptions.",
  weight: 9,
  severity: "error",
  strength: "Long enough to carry the request.",
  applies: (features) => features.isSubstantive,
  detect: (features) => {
    if (features.wordCount >= 8 || features.hasCodeBlock) return null
    return {
      detail: `The prompt is ${features.wordCount} words long and includes no code or file reference.`,
      fix: "Add three things: the goal, the relevant file or snippet, and what success looks like.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** A code task with no code, file, or error to ground it. */
export const noContext: Rule = {
  id: "no-context",
  category: "context",
  title: "No code or file context",
  description:
    "Without a file path, snippet, or error output the agent has to locate the code first. That exploration is where wrong-file edits come from.",
  weight: 9,
  severity: "error",
  strength: "Points at concrete code or files.",
  applies: isCodeTask,
  detect: (features) => {
    if (
      features.hasFilePath ||
      features.hasCodeBlock ||
      features.hasErrorOutput ||
      features.containsUrl
    ) {
      return null
    }
    return {
      detail: "There is no file, code snippet, or error output to ground the request.",
      fix: "Point at the relevant files (`src/...`), paste the code, or include the full error output.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** A bug report without the actual failure. */
export const noErrorDetails: Rule = {
  id: "no-error-details",
  category: "context",
  title: "No error output",
  description:
    "The error message and stack trace usually contain the answer. Omitting them turns a diagnosis into a hunt.",
  weight: 10,
  severity: "error",
  strength: "Includes the actual error output.",
  applies: (features) => hasType(features, "bug"),
  detect: (features) => {
    if (features.hasErrorOutput) return null
    return {
      detail: "The prompt mentions a failure but does not include the error itself.",
      fix: "Paste the exact error message and stack trace, plus the command that produced them.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** A bug report you cannot follow. */
export const noReproduction: Rule = {
  id: "no-reproduction",
  category: "context",
  title: "No reproduction steps",
  description:
    "If the agent cannot reproduce the failure, it can only guess at a fix and cannot verify it afterwards.",
  weight: 8,
  severity: "warn",
  strength: "Gives a numbered sequence to follow.",
  applies: (features) => hasType(features, "bug"),
  detect: (features) => {
    if (features.hasSteps) return null
    return {
      detail: "There is no way to reproduce the failure from this description.",
      fix: "Add numbered steps: what you did, what happened, and what you expected instead.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** Missing versions and platform. */
export const noEnvironment: Rule = {
  id: "no-environment",
  category: "context",
  title: "No environment details",
  description:
    "Runtime version and platform often decide the diagnosis. Without them the agent may fix a problem you do not have.",
  weight: 3,
  severity: "info",
  strength: "Mentions the runtime or platform.",
  applies: (features) => hasType(features, "bug", "setup"),
  detect: (features) => {
    if (features.hasEnvironment) return null
    return {
      detail: "Versions and platform are missing.",
      fix: "Include the runtime and version (`node -v`, `python --version`), the OS, and the command you ran.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** Current vs expected behaviour is unstated. */
export const noCurrentVsExpected: Rule = {
  id: "no-current-vs-expected",
  category: "context",
  title: "Current and expected behaviour are unclear",
  description:
    "The agent needs to know what happens now and what should happen instead. One of the two is usually missing.",
  weight: 6,
  severity: "warn",
  strength: "Separates current behaviour from expected behaviour.",
  applies: (features) => hasType(features, "bug", "refactor"),
  detect: (features) => {
    if (features.hasCurrentVsExpected) return null
    return {
      detail: "It is unclear what the code does today versus what it should do.",
      fix: "Describe current behaviour and expected behaviour in one line each.",
      evidence: excerpt(features.trimmed),
    }
  },
}
