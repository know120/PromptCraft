import type { Rule } from "../types.js"
import { ambiguousReference, noTaskVerb, questionWithoutIntent, vagueTask } from "./clarity.js"
import {
  noContext,
  noCurrentVsExpected,
  noEnvironment,
  noErrorDetails,
  noReproduction,
  tooShort,
} from "./context.js"
import { filler, hedging, shouting } from "./noise.js"
import { compoundRequest, multiTask, noConstraints, tooLong } from "./scope.js"
import { noAcceptance, noOutputFormat, noVerification } from "./verification.js"

/**
 * The built-in rule set, ordered roughly by how much damage the mistake causes.
 * Order only affects display; scoring is weighted independently.
 */
export const defaultRules: readonly Rule[] = [
  // Context
  noErrorDetails,
  tooShort,
  noContext,
  noReproduction,
  noCurrentVsExpected,
  noEnvironment,
  // Clarity
  vagueTask,
  ambiguousReference,
  noTaskVerb,
  questionWithoutIntent,
  // Verification
  noAcceptance,
  noVerification,
  noOutputFormat,
  // Scope
  multiTask,
  noConstraints,
  compoundRequest,
  tooLong,
  // Noise
  hedging,
  shouting,
  filler,
]

export {
  ambiguousReference,
  compoundRequest,
  filler,
  hedging,
  multiTask,
  noAcceptance,
  noConstraints,
  noContext,
  noCurrentVsExpected,
  noEnvironment,
  noErrorDetails,
  noOutputFormat,
  noReproduction,
  noTaskVerb,
  noVerification,
  questionWithoutIntent,
  shouting,
  tooLong,
  tooShort,
  vagueTask,
}
