import type { Rule } from "../types.js"
import { excerpt, hasType, quoted } from "./helpers.js"

/** Several unrelated jobs crammed into one prompt. */
export const multiTask: Rule = {
  id: "multi-task",
  category: "scope",
  title: "Too many tasks at once",
  description:
    "When one prompt contains several independent jobs, the agent interleaves them, reviews become harder, and a failure in one blocks the rest.",
  weight: 7,
  severity: "warn",
  strength: "Keeps the request to a single job.",
  applies: (features) => features.isSubstantive,
  detect: (features) => {
    const actions = Math.max(
      features.imperativeClauseCount,
      features.imperativeSentenceCount,
    )
    if (actions < 4 && features.listItemCount < 6) return null
    return {
      detail: `The prompt contains ${actions} separate actions and ${features.listItemCount} list items.`,
      fix: "Split independent jobs into separate prompts. If they must stay together, number them and say they should be done in one pass.",
      evidence: excerpt(features.taskVerbs.join(", ")),
    }
  },
}

/** No boundaries on what may change. */
export const noConstraints: Rule = {
  id: "no-constraints",
  category: "scope",
  title: "No boundaries",
  description:
    "Nothing says what must stay the same, so a small request can turn into an unrequested refactor.",
  weight: 5,
  severity: "warn",
  strength: "Sets boundaries for the change.",
  applies: (features) => hasType(features, "feature", "refactor", "performance", "setup"),
  detect: (features) => {
    if (features.hasConstraints) return null
    return {
      detail: "Nothing bounds the change, so the agent may touch files you did not intend.",
      fix: "Add one or two constraints: what must not change, what to leave alone, and whether new dependencies are allowed.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** Reference material dumped into the prompt. */
export const tooLong: Rule = {
  id: "too-long",
  category: "scope",
  title: "Buried request",
  description:
    "Long prompts push the actual ask into the middle, where instructions are easiest to lose. Reference material belongs in an attachment.",
  weight: 3,
  severity: "info",
  strength: "Stays focused.",
  applies: (features) => features.isSubstantive,
  detect: (features) => {
    if (features.wordCount <= 400) return null
    return {
      detail: `At ${features.wordCount} words the request is buried among supporting detail.`,
      fix: "Put the ask and the acceptance criteria first, then move logs and reference material into an attached file.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** A short prompt that still hides more than one request. */
export const compoundRequest: Rule = {
  id: "compound-request",
  category: "scope",
  title: "Compound request",
  description:
    "Two verbs joined by \"and\" can mean two independent deliverables, which makes the result hard to accept or reject.",
  weight: 4,
  severity: "info",
  strength: "Asks for one deliverable.",
  applies: (features) => features.isSubstantive,
  detect: (features) => {
    if (features.imperativeClauseCount !== 1) return null
    const multiple =
      /\b(?:and|then|also)\b[^.!?\n]{0,40}\b(?:add|fix|refactor|update|remove|write|test|document|implement|create|change|improve|migrate|rename)\b/i.test(
        features.trimmed,
      )
    if (!multiple) return null
    return {
      detail: "A single sentence asks for more than one change.",
      fix: "Decide which change matters first, and move the rest into a follow-up prompt.",
      evidence: excerpt(features.trimmed),
    }
  },
}
