import type { Rule } from "../types.js"
import { excerpt, quoted } from "./helpers.js"

/** SHOUTING and stray emphasis. */
export const shouting: Rule = {
  id: "shouting",
  category: "noise",
  title: "Shouting",
  description:
    "All-caps and repeated punctuation read as emphasis rather than instruction, and they make the actual priority harder to spot.",
  weight: 2,
  severity: "info",
  strength: "Uses normal emphasis.",
  applies: (features) => features.wordCount >= 4,
  detect: (features) => {
    if (features.uppercaseWordRatio < 0.2 && !features.hasRepeatedPunctuation) return null
    return {
      detail: "The prompt leans on capitals or repeated punctuation for emphasis.",
      fix: "Use normal casing and reserve emphasis for the one requirement that matters most.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** Pleasantries that add tokens but not intent. */
export const filler: Rule = {
  id: "filler",
  category: "noise",
  title: "Politeness padding",
  description:
    "Pleasantries are harmless once, but a pile of them dilutes the request and buries the verb.",
  weight: 1,
  severity: "info",
  strength: "Gets to the point.",
  applies: (features) => features.isSubstantive,
  detect: (features) => {
    if (features.fillerTerms.length < 2) return null
    return {
      detail: `The prompt opens with or repeats ${quoted(features.fillerTerms)}.`,
      fix: "Drop the pleasantries and state the request directly.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** Hedges that make requirements optional. */
export const hedging: Rule = {
  id: "hedging",
  category: "noise",
  title: "Hedged requirements",
  description:
    "Words like \"maybe\" and \"if possible\" read as optional. The agent may skip them and still claim the prompt was satisfied.",
  weight: 3,
  severity: "warn",
  strength: "States requirements decisively.",
  applies: (features) => features.isSubstantive,
  detect: (features) => {
    if (features.hedgeTerms.length === 0) return null
    return {
      detail: `These words make the requirements sound optional: ${quoted(features.hedgeTerms)}.`,
      fix: "Decide whether each item is required. Remove the hedge, or mark the item explicitly as optional.",
      evidence: excerpt(features.trimmed),
    }
  },
}
