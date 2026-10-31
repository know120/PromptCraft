import type { PromptFeatures, TaskType } from "./types.js"

const FILE_EXTENSIONS = [
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "pyi", "rb", "go", "rs",
  "java", "kt", "kts", "cs", "cpp", "cc", "cxx", "c", "h", "hpp", "css",
  "scss", "sass", "less", "html", "json", "jsonc", "yaml", "yml", "toml",
  "md", "mdx", "sql", "sh", "bash", "zsh", "ps1", "svelte", "vue", "php",
  "swift", "dart", "ex", "exs", "erl", "hs", "lua", "r", "scala", "gradle",
  "xml", "ini", "cfg", "lock",
].join("|")

const PATH_RE = new RegExp(
  String.raw`(?<=^|[\s(\`'"])((?:~|\.{1,2})?(?:[/\\])?[\w.@-]+(?:[/\\][\w.@-]+)+\.(?:${FILE_EXTENSIONS}))(?=$|[\s)\`'",:;])`,
  "gi",
)

const BARE_FILE_RE = new RegExp(
  String.raw`(?<=^|[\s(\`'"])([\w@-]+\.(?:${FILE_EXTENSIONS}))(?=$|[\s)\`'",:;])`,
  "gi",
)

const TASK_VERBS = new Set([
  "add", "audit", "benchmark", "build", "bump", "change", "check", "clean",
  "cleanup", "configure", "connect", "convert", "create", "debug", "delete",
  "deploy", "design", "document", "draft", "enable", "ensure", "explain",
  "expose", "extract", "find", "fix", "format", "generate", "handle",
  "implement", "improve", "increase", "install", "integrate", "investigate",
  "lint", "look", "make", "merge", "migrate", "move", "optimise", "optimize",
  "patch", "plan", "profile", "reduce", "refactor", "remove", "rename",
  "render", "replace", "reproduce", "return", "revert", "review", "rewrite",
  "set", "setup", "simplify", "speed", "split", "style", "support", "test",
  "trace", "update", "upgrade", "validate", "verify", "wire", "write",
])

const VAGUE_TERMS = [
  "fix it", "fix this", "make it better", "make it work", "improve",
  "optimize", "optimise", "better", "nicer", "clean up", "cleanup",
  "modernize", "robust", "properly", "correctly", "as needed", "etc",
  "and so on", "stuff", "things", "thing", "somehow", "something", "a few",
  "several", "various", "appropriate", "reasonable",
]

const HEDGE_TERMS = [
  "maybe", "perhaps", "probably", "if possible", "i think", "i guess",
  "not sure", "might be", "could be", "kind of", "sort of", "hopefully",
  "ideally", "preferably",
]

const FILLER_TERMS = [
  "please", "kindly", "could you", "can you", "would you", "i want you to",
  "i need you to", "thanks", "thank you",
]

const LEAD_FILLER_RE =
  /^(?:please|kindly|hey|hi|hello)[\s,]+|^(?:can|could|would|will)\s+you\s+(?:please\s+)?|^i\s+(?:want|need|would\s+like)\s+you\s+to\s+/i

function findMatches(text: string, re: RegExp): string[] {
  return text.match(re) ?? []
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))]
}

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function firstWord(sentence: string): string | undefined {
  const withoutMarker = sentence.replace(/^\s*(?:\d+[.)]|[-*+])\s+/, "")
  const withoutFiller = withoutMarker.replace(LEAD_FILLER_RE, "")
  return withoutFiller.match(/^[`"'(]*([a-z]+)/i)?.[1]?.toLowerCase()
}

function detectTaskTypes(text: string, asksQuestion: boolean): TaskType[] {
  const patterns: ReadonlyArray<[TaskType, RegExp]> = [
    ["bug", /\b(?:bug|errors?|exception|traceback|stack trace|crash(?:es|ing)?|broken|fails?|failing|failure|regression|panic|segfault|not working|doesn't work|does not work|unexpected|issue|problem)\b/i],
    ["performance", /\b(?:slow(?:er)?|performance|optimi[sz]e|latency|memory leak|cpu|throughput|speed up|faster)\b/i],
    ["refactor", /\b(?:refactor|clean ?up|restructure|reorgani[sz]e|simplif(?:y|ies)|extract|rename|deduplicate|dry)\b/i],
    ["test", /\b(?:tests?|specs?|coverage|unit tests?|integration tests?|e2e)\b/i],
    ["docs", /\b(?:document(?:ation)?|readme|docstrings?|jsdoc|comments?|changelog)\b/i],
    ["review", /\b(?:review|audit|critique|code review|look over|sanity check)\b/i],
    ["setup", /\b(?:install|configure|config|setup|set up|migrate|upgrade|bootstrap|scaffold|pipeline|docker)\b/i],
    ["feature", /\b(?:add|implement|introduce|build|create|support|allow|enable|expose|integrate|new feature)\b/i],
  ]

  const types = patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([type]) => type)

  if (asksQuestion && types.length === 0) types.push("question")
  if (types.length === 0) types.push("unknown")
  return [...new Set(types)]
}

export function extractFeatures(prompt: string): PromptFeatures {
  const trimmed = prompt.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)
  const sentences = splitSentences(trimmed)
  const lower = trimmed.toLowerCase()

  const filePaths = unique([
    ...findMatches(trimmed, PATH_RE),
    ...findMatches(trimmed, BARE_FILE_RE),
  ])

  const hasCodeBlock = /```[\s\S]*?```/.test(trimmed)
  const hasInlineCode = /`[^`\n]+`/.test(trimmed)
  const containsUrl = /https?:\/\/\S+/i.test(trimmed)
  const hasErrorOutput =
    /(?:traceback \(most recent call last\)|uncaught |\b(?:type|reference|syntax|range|name)error\b|^error:|exception|panic:|fatal error:|segmentation fault|core dumped)/im.test(trimmed) ||
    /\bat\s+[\w.$<>]+\s*\([^)]*:\d+:\d+\)/.test(trimmed) ||
    /exit(?:ed)?\s+(?:with\s+)?(?:code|status)\s+[1-9]\d*/i.test(trimmed) ||
    /\bE[A-Z]{3,}\b/.test(trimmed)

  const listItemCount =
    trimmed.match(/^\s*(?:\d+[.)]|[-*+])\s+\S/gm)?.length ?? 0
  const numberedItems =
    trimmed.match(/^\s*\d+[.)]\s+\S/gm)?.length ?? 0

  const hasSteps =
    /\b(?:steps? to reproduce|to reproduce|repro(?:duction)? steps?|how to reproduce|steps:)/i.test(trimmed) ||
    numberedItems >= 3
  const hasAcceptanceCriteria =
    /\b(?:acceptance criteria|definition of done|done when|success criteria|expected (?:behaviou?r|result|output|response)|should (?:return|show|render|display|be|work|pass|fail|throw|log|create|update|remain)|must (?:return|show|be|pass|fail|remain|not|never)|tests? (?:must|should) pass|verify that|make sure|ensure that)\b/i.test(trimmed)
  const hasConstraints =
    /\b(?:do not|don't|without|only|must not|never|keep|preserve|avoid|limit|backwards? compat\w*|minimal|out of scope|scope)\b/i.test(trimmed)
  const hasOutputFormat =
    /\b(?:format|as (?:a |an )?(?:json|markdown|table|list|bullets?|diff|patch|yaml)|json|markdown|table|bullet points?|output|respond with|give me|produce)\b/i.test(trimmed)
  const hasExample =
    /\b(?:for example|e\.g\.|example:|such as|like this|here(?:'s| is) an example)\b/i.test(trimmed)
  const hasVerification =
    /\b(?:run (?:the )?(?:tests?|suite|linter|typecheck|type checker|build)|npm (?:run )?(?:test|build|lint|typecheck)|(?:pnpm|yarn|bun) (?:run )?(?:test|build|lint|typecheck)|pytest|cargo test|go test|mvn test|make test|typecheck|lint|verify)\b/i.test(trimmed)
  const hasEnvironment =
    /\b(?:v?\d+\.\d+(?:\.\d+)?|macos|linux|windows|ubuntu|debian|arch|fedora|docker|kubernetes|postgres(?:ql)?|mysql|redis)\b/i.test(trimmed)
  /**
   * Require both sides: a description of what happens now and a description of
   * what should happen instead. A lone "broken" or "error" says nothing about
   * the expected behaviour.
   */
  const currentState =
    /\b(?:current(?:ly)?|right now|for now|today|actual(?:ly)?|instead|but|however|broken|fails?|failing|failure|crash(?:es|ing)?|errors?|wrong|happens?|returns?|shows?|does not|doesn't|isn't|not working)\b/i.test(
      trimmed,
    )
  const expectedState =
    /\b(?:expected|should|instead|want(?:ed)?|needs? to|ought to|supposed to|so that|would like)\b/i.test(
      trimmed,
    )
  const hasCurrentVsExpected =
    (currentState && expectedState) ||
    /\bexpected\b[\s\S]{0,400}\bactual\b/i.test(trimmed)

  const questionMarks = countMatches(trimmed, /\?/g)
  const asksQuestion =
    questionMarks > 0 ||
    /^(?:how|what|why|when|where|which|who|can|could|should|is|are|do|does|did)\b/i.test(trimmed)

  const imperativeSentenceCount = sentences.filter((sentence) => {
    const word = firstWord(sentence)
    return word !== undefined && TASK_VERBS.has(word)
  }).length

  const joinedClauseRe = new RegExp(
    String.raw`(?:,|;|\b(?:and|then|also)\b)\s+(?:also\s+)?(?:${[...TASK_VERBS].join("|")})\b`,
    "gi",
  )
  const imperativeClauseCount =
    imperativeSentenceCount + countMatches(trimmed, joinedClauseRe)

  const vagueTerms = unique(
    VAGUE_TERMS.filter((term) =>
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower),
    ),
  )

  const ambiguousReferences = unique([
    ...findMatches(
      trimmed,
      /\b(?:fix|change|update|refactor|review|check|improve|debug|test|touch|handle)\s+(?:the\s+)?(?:\w+\s+)?(?:it|this|that|them|these|those|thing)\b/gi,
    ),
    ...findMatches(
      trimmed,
      /\b(?:it|this|that)(?:'s|\s+is|\s+isn't|\s+is not|\s+does not|\s+doesn't|\s+fails?|\s+breaks?|\s+should|\s+needs?)\b/gi,
    ),
    ...findMatches(
      trimmed,
      /\b(?:the|this|that)\s+(?:file|function|method|class|component|module|page|test|endpoint|button|screen|code|repo)\b/gi,
    ),
  ])

  const hedgeTerms = unique(
    HEDGE_TERMS.filter((term) => lower.includes(term)),
  )
  const fillerTerms = unique(
    FILLER_TERMS.filter((term) =>
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower),
    ),
  )

  const taskVerbs = unique(
    words
      .map((word) => word.replace(/[^a-z]/gi, "").toLowerCase())
      .filter((word) => TASK_VERBS.has(word)),
  )

  const capitalizable = words.filter((word) => /^[a-z]{3,}$/i.test(word))
  const uppercaseWords = capitalizable.filter((word) => /^[A-Z][A-Z0-9_-]+$/.test(word))
  const uppercaseWordRatio =
    capitalizable.length === 0 ? 0 : uppercaseWords.length / capitalizable.length

  return {
    prompt,
    trimmed,
    wordCount: words.length,
    charCount: trimmed.length,
    lineCount: trimmed ? trimmed.split("\n").length : 0,
    sentenceCount: sentences.length,
    hasCodeBlock,
    hasInlineCode,
    containsUrl,
    filePaths,
    hasFilePath: filePaths.length > 0,
    hasErrorOutput,
    hasSteps,
    hasAcceptanceCriteria,
    hasConstraints,
    hasOutputFormat,
    hasExample,
    hasVerification,
    hasEnvironment,
    hasCurrentVsExpected,
    asksQuestion,
    hasMultipleQuestions: questionMarks >= 2,
    imperativeSentenceCount,
    imperativeClauseCount,
    listItemCount,
    vagueTerms,
    ambiguousReferences,
    hedgeTerms,
    fillerTerms,
    taskVerbs,
    taskTypes: detectTaskTypes(trimmed, asksQuestion),
    uppercaseWordRatio,
    hasRepeatedPunctuation: /[!?]{2,}/.test(trimmed),
    isSubstantive: words.length >= 3 || hasCodeBlock,
  }
}
