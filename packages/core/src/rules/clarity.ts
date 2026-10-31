import type { Rule } from "../types.js"
import { excerpt, quoted } from "./helpers.js"

/** Quality words with nothing concrete to anchor them. */
export const vagueTask: Rule = {
  id: "vague-task",
  category: "clarity",
  title: "Vague goal",
  description:
    'Words like "improve" or "clean up" describe a feeling, not a result. The agent has to invent what success means, which is where most wasted work starts.',
  weight: 8,
  severity: "error",
  strength: "Avoids vague quality words.",
  applies: (features) => features.isSubstantive,
  detect: (features) => {
    if (features.vagueTerms.length === 0) return null
    const anchored =
      features.hasFilePath ||
      features.hasCodeBlock ||
      features.hasAcceptanceCriteria ||
      features.hasOutputFormat ||
      features.hasConstraints
    if (anchored) return null
    return {
      detail: `The goal leans on ${quoted(features.vagueTerms)} with nothing concrete to anchor it.`,
      fix: "Replace the quality word with the behaviour you want: what changes, where, and how you will know it changed.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** "Fix it" / "the file" without naming anything. */
export const ambiguousReference: Rule = {
  id: "ambiguous-reference",
  category: "clarity",
  title: "Ambiguous reference",
  description:
    "Pronouns and bare nouns such as \"it\" or \"the file\" make the agent search the repository for a target instead of working on one.",
  weight: 7,
  severity: "error",
  strength: "Avoids ambiguous pronouns and bare nouns.",
  applies: (features) => features.isSubstantive && !features.hasFilePath,
  detect: (features) => {
    if (features.ambiguousReferences.length === 0) return null
    return {
      detail: `These references do not point at a specific file or symbol: ${quoted(features.ambiguousReferences)}.`,
      fix: "Name the file, function, or component, or attach it with an @-mention so the agent does not have to guess.",
      evidence: excerpt(features.ambiguousReferences.join(", ")),
    }
  },
}

/** A topic with no requested action. */
export const noTaskVerb: Rule = {
  id: "no-task-verb",
  category: "clarity",
  title: "No requested action",
  description:
    "The prompt names a subject but never says what to do with it, leaving the deliverable undefined.",
  weight: 4,
  severity: "warn",
  strength: "Uses a clear action verb.",
  applies: (features) => features.isSubstantive && !features.asksQuestion,
  detect: (features) => {
    if (features.taskVerbs.length > 0) return null
    return {
      detail: "The prompt describes a topic but never asks for a concrete action.",
      fix: "Open with the action: fix, add, refactor, explain, review, or write tests.",
      evidence: excerpt(features.trimmed),
    }
  },
}

/** "How do I ..." without saying whether to explain or implement. */
export const questionWithoutIntent: Rule = {
  id: "question-without-intent",
  category: "clarity",
  title: "Question without a deliverable",
  description:
    "A bare question can be answered with prose or with a patch. The agent picks one, and it may not be the one you wanted.",
  weight: 4,
  severity: "warn",
  strength: "Says what kind of answer is wanted.",
  applies: (features) => features.asksQuestion,
  detect: (features) => {
    const explicit =
      /\b(?:explain|show me|tell me|walk me through|implement|add|fix|write|change|give me (?:the )?code|propose|plan)\b/i.test(
        features.trimmed,
      )
    if (explicit) return null
    return {
      detail: "A question leaves it open whether you want an explanation, a plan, or a code change.",
      fix: 'State the deliverable: "explain why…", "propose a plan for…", or "implement…".',
      evidence: excerpt(features.trimmed),
    }
  },
}
