// Teaching-quality heuristics over every lesson: `npm run audit`.
//
// validate decides whether the content is correct; audit estimates whether it
// teaches well. The rules are the table in docs/v2-spec.md ("Audit"), built on
// the measurements in docs/learning-review.md (sections 1 and 5). They are
// heuristics: audit reports, the author decides.
//
// A template-2 lesson (`template: 2` in meta.yaml) gets each rule's own level;
// a legacy lesson gets every finding as a warning. With --strict the exit code
// is 1 when a template-2 lesson has an error; pre-commit runs it after validate.
//
// Chapter rules (15, 16) audit a module's chapter sets; a chapter whose lessons
// are all template 2 gets their own level, any other chapter only warnings.
//
//   npm run audit                        findings by lesson, then counts per rule
//   npm run audit -- --lesson group-by   one lesson (or a chapter: chapter:m3)
//   npm run audit -- --json              machine-readable
//   npm run audit -- --strict            list only the errors; exit 1 if there are any

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { chapterKey, LANGS, type Bi, type Course, type Exercise, type Lang, type Module, type Term } from '../src/content/types.ts'
import { finalResult } from '../src/engine/grade.ts'
import { PracticeDb } from '../src/engine/practice-db.ts'
import { buildContent } from './lib/build-content.ts'
import { renderSnippet } from './lib/markdown.ts'
import { sqlWords, type Lexicon } from './lib/vocabulary.ts'

export type Level = 'error' | 'warning'

/** The rules of docs/v2-spec.md in report order, with their level for template-2 lessons. */
export const RULES = [
  { id: '1', level: 'error', title: 'write solution close to lesson SQL' },
  { id: '2', level: 'error', title: 'hint code gives the solution away' },
  { id: '3', level: 'warning', title: 'predict prompt contains the answer' },
  { id: '4', level: 'error', title: 'explain or choice why missing' },
  { id: '5', level: 'error', title: 'introduced word in no exercise' },
  { id: '5b', level: 'warning', title: 'introduced word in no write exercise' },
  { id: '6', level: 'error', title: 'objective practised too little' },
  { id: '7', level: 'warning', title: 'more mistakes than traps + debug exercises' },
  { id: '8', level: 'error', title: 'more than 8 new words' },
  { id: '9', level: 'error', title: 'deeper longer than core' },
  { id: '10', level: 'warning', title: 'forward reference in prose' },
  { id: '11', level: 'error', title: 'other database named outside deeper/reference' },
  { id: '12', level: 'warning', title: 'mostly row-count predicts' },
  { id: '13', level: 'error', title: 'fewer than two check blocks' },
  { id: '13b', level: 'warning', title: 'no steps block' },
  { id: '14', level: 'warning', title: 'traps on under half of write + debug' },
  { id: '15', level: 'error', title: 'chapter challenges missing or too narrow', scope: 'chapter' },
  { id: '16', level: 'warning', title: 'challenge solution close to lesson SQL', scope: 'chapter' },
] as const satisfies readonly { id: string; level: Level; title: string; scope?: 'chapter' }[]

export type RuleId = (typeof RULES)[number]['id']
const RULE = new Map<RuleId, (typeof RULES)[number]>(RULES.map(r => [r.id, r]))

export interface Finding {
  /** The lesson id, or `chapter:<module id>` for a chapter rule. */
  lesson: string
  /**
   * Exercise file stem (`08-write-orders-per-month`) when the finding is about
   * one exercise; for a chapter set item, `challenge/<stem>`.
   */
  exercise?: string
  rule: RuleId
  level: Level
  /** The lesson's template: 2, or 1 for legacy lessons. A chapter is 2 when all its lessons are. */
  template: number
  message: string
}

export interface AuditReport {
  /** Every lesson audited, in curriculum order. */
  lessons: { id: string; template: number }[]
  /** Every chapter with lessons, as `chapter:<module id>`, in curriculum order. */
  chapters: { id: string; template: number }[]
  findings: Finding[]
}

const COPY_SIMILARITY = 0.6 // rule 1: bigram Jaccard
const HINT_COVERAGE = 0.6 // rule 2
const MAX_NEW_WORDS = 8 // rule 8
const MIN_CHECKS = 2 // rule 13
const MIN_CHALLENGES = 3 // rule 15
const MIN_CHALLENGE_LESSONS = 3 // rule 15: lessons whose words each challenge uses
/** Rule 11: the sections where other databases may be named. */
const DIALECT_SECTIONS = new Set(['deeper', 'reference'])
const OTHER_DATABASES = /\b(?:MySQL|SQLite|Oracle|SQL Server)\b/g
/** Rule 10. `第 N 章` and `Chapter N` count only when chapter N comes after the lesson's own. */
const FORWARD: Record<Lang, RegExp> = {
  zh: /第\s*(\d+)\s*章|下一篇|下下篇|后面会|以后会|稍后/g,
  en: /\b[Cc]hapter\s+(\d+)|\bnext lessons?\b|\bthe lesson after\b|\blater (?:chapters?|lessons?)\b/g,
}
/** Rule 7: a numbered item, `**1. …**`, `### 1. …` or `1. …`. */
const NUMBERED = /^(?:\*\*|#{3,6}\s+)?\d+[.)]\s/
/** Rule 3: a predict answer that is a number, perhaps with its unit. */
const ANSWER_NUMBER = /^\s*(-?\d+(?:\.\d+)?)\s*(?:rows?|行)?\s*$/i

export async function audit(root: string): Promise<AuditReport> {
  const { course, sources, vocabulary } = buildContent(root)
  const glossary = new Map(course.glossary.map(t => [t.id, t]))
  const report: AuditReport = { lessons: [], chapters: [], findings: [] }

  for (const [chapter, mod] of course.modules.entries()) {
    for (const id of mod.lessons) {
      const lesson = course.lessons[id]
      const dataset = lesson && course.datasets[lesson.dataset]
      if (!lesson || dataset === undefined) continue // validate reports these
      const meta = readMeta(root, id)
      report.lessons.push({ id, template: meta.template })
      report.findings.push(...auditLesson({
        id,
        chapter,
        meta,
        introduces: vocabulary[id]?.introduces ?? [],
        md: { zh: scanMarkdown(sources[id]?.zh ?? ''), en: scanMarkdown(sources[id]?.en ?? '') },
        exercises: lesson.exercises.map(ex => {
          const stem = ex.id.slice(id.length + 1)
          return { ex, stem, raw: readExercise(root, id, stem) }
        }),
        lex: await lexiconFor(dataset),
        glossary,
      }))
    }
  }

  // Taught where: the path index of the lesson that introduces each word.
  const taughtIn = new Map<string, string>()
  for (const id of course.path) for (const word of vocabulary[id]?.introduces ?? []) if (!taughtIn.has(word)) taughtIn.set(word, id)
  for (const mod of course.modules) {
    const lessons = mod.lessons.filter(id => course.lessons[id])
    const dataset = course.datasets[mod.dataset]
    if (!lessons.length) continue
    const template = lessons.every(id => readMeta(root, id).template >= 2) ? 2 : 1
    report.chapters.push({ id: chapterKey(mod.id), template })
    if (dataset === undefined && mod.challenge.length) continue // validate reports it
    report.findings.push(...auditChapter(mod, template, course, sources, taughtIn, dataset === undefined ? undefined : await lexiconFor(dataset)))
  }
  return report
}

/** Rules 15 and 16: a chapter's challenges integrate several lessons and are not copies of lesson SQL. */
function auditChapter(mod: Module, template: number, course: Course, sources: Record<string, Record<Lang, string>>, taughtIn: Map<string, string>, lex: Lexicon | undefined): Finding[] {
  const out: Finding[] = []
  const lesson = chapterKey(mod.id)
  const report = (rule: RuleId, message: string, exercise?: string) => out.push({
    lesson,
    ...(exercise === undefined ? {} : { exercise }),
    rule,
    level: template >= 2 ? RULE.get(rule)!.level : 'warning',
    template,
    message,
  })
  const stem = (ex: Exercise) => ex.id.slice(lesson.length + 1)

  // 15. Enough challenges, each drawing on several lessons.
  if (mod.challenge.length < MIN_CHALLENGES) report('15', `${mod.challenge.length} challenge(s), needs ${MIN_CHALLENGES}`)
  for (const ex of lex ? mod.challenge : []) {
    const from = new Set([...sqlWords(answerSql(ex), lex!)].map(w => taughtIn.get(w)).filter((l): l is string => l !== undefined))
    if (from.size < MIN_CHALLENGE_LESSONS) {
      report('15', `solution uses words from ${from.size} lesson(s)${from.size ? `: ${[...from].join(', ')}` : ''}; needs ${MIN_CHALLENGE_LESSONS}`, stem(ex))
    }
  }

  // 16. A challenge is solved, not copied from the chapter's lessons.
  const shown = mod.lessons.flatMap(id => [
    ...LANGS.flatMap(lang => scanMarkdown(sources[id]?.[lang] ?? '').flatMap(s => s.fences.flatMap(f => {
      const at = `${id}/lesson.${lang}.md:${f.line}`
      if (f.kind === 'sql') return [{ sql: f.body, where: `the sql block at ${at}` }]
      if (f.kind === 'check') return [{ sql: checkQuery(f), where: `the check block at ${at}` }]
      if (f.kind === 'steps') return stepsSql(f).map((sql, i) => ({ sql, where: `step ${i + 1} of the steps block at ${at}` }))
      return []
    }))),
    ...(course.lessons[id]?.exercises ?? []).map(ex => ({ sql: answerSql(ex), where: `exercise ${ex.id}` })),
  ]).filter(s => s.sql.trim())
  for (const ex of mod.challenge) {
    if (ex.kind !== 'write') continue
    let best = { score: 0, where: '' }
    for (const s of shown) {
      const score = similarity(ex.solution, s.sql)
      if (score > best.score) best = { score, where: s.where }
    }
    if (best.score >= COPY_SIMILARITY) report('16', `solution has bigram Jaccard ${best.score.toFixed(2)} with ${best.where}`, stem(ex))
  }
  return out
}

interface LessonInput {
  id: string
  /** Index of the lesson's module: 第 N 章 / Chapter N. */
  chapter: number
  meta: LessonMeta
  introduces: string[]
  md: Record<Lang, MdSection[]>
  exercises: { ex: Exercise; stem: string; raw: ExerciseExtras }[]
  lex: Lexicon
  glossary: Map<string, Term>
}

function auditLesson(l: LessonInput): Finding[] {
  const out: Finding[] = []
  const v2 = l.meta.template >= 2
  const report = (rule: RuleId, message: string, exercise?: string) => out.push({
    lesson: l.id,
    ...(exercise === undefined ? {} : { exercise }),
    rule,
    level: v2 ? RULE.get(rule)!.level : 'warning',
    template: l.meta.template,
    message,
  })
  const fences = (lang: Lang, kind: string) => l.md[lang].flatMap(s => s.fences.filter(f => f.kind === kind))

  // 1. A write solution close to SQL the lesson already shows can be copied instead of solved.
  const shown = LANGS.flatMap(lang => l.md[lang].flatMap(s => s.fences.flatMap(f => {
    const at = `lesson.${lang}.md:${f.line}`
    if (f.kind === 'sql') return [{ sql: f.body, where: `the sql block at ${at}` }]
    if (f.kind === 'check') return [{ sql: checkQuery(f), where: `the check block at ${at}` }]
    if (f.kind === 'steps') return stepsSql(f).map((sql, i) => ({ sql, where: `step ${i + 1} of the steps block at ${at}` }))
    return []
  }))).filter(s => s.sql.trim())
  for (const { ex, stem } of l.exercises) {
    if (ex.kind !== 'write') continue
    let best = { score: 0, where: '' }
    for (const s of shown) {
      const score = similarity(ex.solution, s.sql)
      if (score > best.score) best = { score, where: s.where }
    }
    if (best.score >= COPY_SIMILARITY) report('1', `solution has bigram Jaccard ${best.score.toFixed(2)} with ${best.where}`, stem)
  }

  // 2. Hints whose code already spells out most of the solution.
  for (const { ex, stem, raw } of l.exercises) {
    if (ex.kind === 'predict') continue
    const needed = identifiers(ex.solution)
    const hinted = identifiers(raw.hints.flatMap(h => LANGS.flatMap(lang => inlineCode(h[lang]))).join(' '))
    const covered = [...needed].filter(t => hinted.has(t)).length
    if (needed.size && covered / needed.size >= HINT_COVERAGE) {
      report('2', `hint code shows ${covered} of the solution's ${needed.size} identifiers`, stem)
    }
  }

  // 3. A predict whose prompt already contains the number it asks for.
  for (const { ex, stem, raw } of l.exercises) {
    if (ex.kind !== 'predict') continue
    const answer = raw.choices[ex.answer]?.text
    const n = answer && LANGS.map(lang => ANSWER_NUMBER.exec(answer[lang])?.[1]).find(Boolean)
    if (n && LANGS.some(lang => containsNumber(raw.prompt[lang], n))) report('3', `the prompt contains the answer, ${n}`, stem)
  }

  // 4. Every exercise explains its answer; every predict choice says why it is right or wrong.
  for (const { ex, stem, raw } of l.exercises) {
    if (!raw.explain) report('4', 'no explain', stem)
    if (ex.kind === 'predict') {
      const missing = raw.choices.filter(c => !c.why).length
      if (missing) report('4', `${missing} of ${raw.choices.length} choices have no why`, stem)
    }
  }

  // 5, 5b. What the lesson introduces is practised, and produced in a write exercise.
  // A word counts as validate counts it, in the SQL the learner reads or writes as
  // the answer: a predict's query, otherwise the solution.
  const used = l.exercises.map(({ ex }) => ({ write: ex.kind === 'write', words: sqlWords(answerSql(ex), l.lex) }))
  for (const word of l.introduces) {
    if (l.meta.reference.includes(word)) continue
    if (!used.some(u => u.words.has(word))) report('5', `${word} appears in no exercise`)
    else if (!used.some(u => u.write && u.words.has(word))) report('5b', `${word} appears in no write exercise`)
  }

  // 6. Each objective is practised at least twice, at least once by writing a query.
  for (const objective of l.meta.objectives) {
    const kinds = l.exercises.filter(e => e.raw.objective === objective).map(e => e.ex.kind)
    if (kinds.length < 2 || !kinds.includes('write')) {
      report('6', `objective ${objective} has ${kinds.length} exercise(s)${kinds.includes('write') ? '' : ', none of them write'}`)
    }
  }

  // 7. Every common mistake the lesson lists is caught somewhere: by a trap or a debug exercise.
  const mistakes = Math.max(...LANGS.map(lang => l.md[lang]
    .filter(s => s.id === 'mistakes').flatMap(s => s.prose).filter(p => NUMBERED.test(p.text)).length))
  const traps = l.exercises.reduce((n, e) => n + e.raw.traps, 0)
  const debug = l.exercises.filter(e => e.ex.kind === 'debug').length
  if (mistakes > traps + debug) report('7', `${mistakes} numbered mistakes, but ${traps} trap(s) and ${debug} debug exercise(s)`)

  // 8. A lesson teaches a few things well rather than many in passing.
  const fresh = l.introduces.filter(w => !l.meta.reference.includes(w))
  if (fresh.length > MAX_NEW_WORDS) report('8', `introduces ${fresh.length} words outside reference: ${fresh.join(' ')}`)

  // 9. The core idea gets more room than its edge cases.
  const core = cjkCount(l.md.zh, 'core', l.glossary)
  const deeper = cjkCount(l.md.zh, 'deeper', l.glossary)
  if (deeper > core) report('9', `deeper has ${deeper} CJK characters, core ${core} (zh, code excluded)`)

  // 10. "Explained later" is not an explanation.
  for (const lang of LANGS) {
    for (const s of l.md[lang]) {
      for (const p of s.prose) {
        for (const m of p.text.matchAll(FORWARD[lang])) {
          if (m[1] !== undefined && Number(m[1]) <= l.chapter) continue
          report('10', `"${m[0]}" at lesson.${lang}.md:${p.line} (${s.id})`)
        }
      }
    }
  }

  // 11. Dialect notes belong in deeper or reference.
  for (const lang of LANGS) {
    for (const s of l.md[lang]) {
      if (DIALECT_SECTIONS.has(s.id)) continue
      for (const p of s.prose) {
        for (const m of p.text.matchAll(OTHER_DATABASES)) report('11', `${m[0]} at lesson.${lang}.md:${p.line} (${s.id})`)
      }
    }
  }

  // 12. Predicts ask more than "how many rows".
  const predicts = l.exercises.map(e => e.ex).filter(ex => ex.kind === 'predict')
  const rowCounts = predicts.filter(ex => ex.verifyRows !== undefined).length
  if (predicts.length && rowCounts > predicts.length / 2) report('12', `${rowCounts} of ${predicts.length} predicts ask for a row count`)

  // 13, 13b. The learner predicts while reading, and sees intermediate results.
  const checks = Math.min(...LANGS.map(lang => fences(lang, 'check').length))
  if (checks < MIN_CHECKS) report('13', `${checks} check block(s), needs ${MIN_CHECKS}`)
  if (Math.min(...LANGS.map(lang => fences(lang, 'steps').length)) === 0) report('13b', 'no steps block')

  // 14. Wrong answers get feedback aimed at the mistake.
  const practice = l.exercises.filter(e => e.ex.kind === 'write' || e.ex.kind === 'debug')
  const trapped = practice.filter(e => e.raw.traps > 0).length
  if (practice.length && trapped < practice.length / 2) report('14', `traps on ${trapped} of ${practice.length} write and debug exercises`)

  return out
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/** Lower-case SQL tokens without comments. String literals become 'lit' unless kept. */
function sqlTokens(sql: string, keepLiterals = false): string[] {
  const code = sql.toLowerCase().replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  const tokens = code.match(/'(?:[^']|'')*'|[a-z_][a-z0-9_.]*|\d+(?:\.\d+)?|[<>=!]+|[(),*;+\-/|:]+/g) ?? []
  return keepLiterals ? tokens : tokens.map(t => (t.startsWith("'") ? "'lit'" : t))
}

/** Bigram Jaccard over normalised tokens: 1 for the same query with other constants, near 0 for unrelated ones. */
export function similarity(a: string, b: string): number {
  const bigrams = (t: string[]) => new Set(t.map((x, i) => `${x} ${t[i + 1] ?? ''}`))
  const A = bigrams(sqlTokens(a))
  const B = bigrams(sqlTokens(b))
  let shared = 0
  for (const x of A) if (B.has(x)) shared++
  return shared / (A.size + B.size - shared || 1)
}

/** Rule 2's identifiers: every name and keyword, `o.id` split into `o` and `id`, without the ubiquitous SELECT, FROM and WHERE. */
function identifiers(sql: string): Set<string> {
  return new Set(sqlTokens(sql, true)
    .filter(t => /^[a-z_]/.test(t))
    .flatMap(t => t.split('.'))
    .filter(t => t && !['select', 'from', 'where'].includes(t)))
}

const inlineCode = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map(m => m[1]!)

const containsNumber = (text: string, n: string) => new RegExp(`(?<![\\d.])${n.replace(/[.-]/g, '\\$&')}(?!\\d|\\.\\d)`).test(text)

const answerSql = (ex: Exercise) => (ex.kind === 'predict' ? ex.query : ex.solution)

/** Chinese characters in a zh section's prose, as rendered, with fenced code left out. */
function cjkCount(sections: MdSection[], id: string, glossary: Map<string, Term>): number {
  const section = sections.find(s => s.id === id)
  if (!section) return 0
  const html = renderSnippet(section.prose.map(p => p.text).join('\n'), { lang: 'zh', glossary, problems: [] })
  return (html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<[^>]+>/g, '').match(/[一-鿿]/g) ?? []).length
}

const lexicons = new Map<string, Promise<Lexicon>>()

/** The lexicon validate uses (`lexiconOf` in validate.ts): Postgres's keywords and functions plus the dataset's names. */
function lexiconFor(datasetSql: string): Promise<Lexicon> {
  let lex = lexicons.get(datasetSql)
  if (!lex) lexicons.set(datasetSql, (lex = loadLexicon(datasetSql)))
  return lex
}

async function loadLexicon(datasetSql: string): Promise<Lexicon> {
  const db = await PracticeDb.create(datasetSql)
  try {
    const rows = async (sql: string) => finalResult(await db.run(sql, { limit: Infinity }))?.rows ?? []
    return {
      keywords: new Map((await rows('SELECT word, catcode FROM pg_get_keywords()')).map(r => [String(r[0]), String(r[1])])),
      functions: new Set((await rows('SELECT DISTINCT proname FROM pg_proc')).map(r => String(r[0]))),
      names: new Set((await rows(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
        UNION SELECT column_name FROM information_schema.columns WHERE table_schema = 'public'`)).map(r => String(r[0]))),
    }
  } finally {
    await db.close()
  }
}

// ---------------------------------------------------------------------------
// Raw reading of the template-2 fields and fences.
//
// buildContent does not read these yet (docs/v2-spec.md), and the shared
// parser for them is being written in parallel. Until it lands, audit reads
// them here, from the raw files, and nowhere else. When it lands, fill these
// shapes from the built Course instead and delete the readers.
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>

interface LessonMeta {
  /** 2 for template-2 lessons, 1 for legacy ones. */
  template: number
  /** Objective ids. */
  objectives: string[]
  /** Words of `introduces` taught for recognition only. */
  reference: string[]
}

interface ExerciseExtras {
  prompt: Bi
  objective?: string
  /** `hints`, plus the legacy `hint` as one more level. */
  hints: Bi[]
  explain: boolean
  /** Number of `traps`. */
  traps: number
  /** Predict choices in any of their forms: string, { zh, en }, { text, why }, { zh, en, why }. */
  choices: { text: Bi; why: boolean }[]
}

interface Fence {
  /** First word of the info string: sql, syntax, check, steps, … */
  kind: string
  body: string
  /** 1-based line of the opening fence. */
  line: number
}

interface MdSection {
  /** The `{#id}` of its `##` heading. */
  id: string
  /** Lines outside fenced blocks, with their 1-based line numbers. */
  prose: { line: number; text: string }[]
  fences: Fence[]
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function toBi(v: unknown): Bi {
  if (v !== null && typeof v === 'object') {
    const o = v as Raw
    return { zh: String(o.zh ?? ''), en: String(o.en ?? '') }
  }
  return v === undefined || v === null ? { zh: '', en: '' } : { zh: String(v), en: String(v) }
}

const hasText = (v: unknown) => LANGS.some(lang => toBi(v)[lang].trim() !== '')

function readYaml(path: string): Raw {
  return (parseYaml(readFileSync(path, 'utf8')) ?? {}) as Raw
}

function readMeta(root: string, id: string): LessonMeta {
  const meta = readYaml(join(root, 'lessons', id, 'meta.yaml'))
  return {
    template: Number(meta.template) || 1,
    objectives: list(meta.objectives).map(o => String((o as Raw | null)?.id ?? '')).filter(Boolean),
    reference: list(meta.reference).map(String),
  }
}

function readExercise(root: string, lesson: string, stem: string): ExerciseExtras {
  const raw = readYaml(join(root, 'lessons', lesson, 'exercises', `${stem}.yaml`))
  return {
    prompt: toBi(raw.prompt),
    objective: raw.objective === undefined ? undefined : String(raw.objective),
    hints: [...list(raw.hints), ...(raw.hint === undefined ? [] : [raw.hint])].map(toBi),
    explain: hasText(raw.explain),
    traps: list(raw.traps).length,
    choices: list(raw.choices).map(c => {
      const o: Raw = c !== null && typeof c === 'object' ? (c as Raw) : { text: c }
      return { text: toBi('text' in o ? o.text : o), why: hasText(o.why) }
    }),
  }
}

/** A lesson file as `##` sections, each with its prose lines and its fenced blocks. */
export function scanMarkdown(src: string): MdSection[] {
  const sections: MdSection[] = []
  let open: { marker: string; indent: number; kind: string; line: number; body: string[] } | undefined
  const close = () => {
    sections.at(-1)?.fences.push({ kind: open!.kind, body: open!.body.join('\n').trim(), line: open!.line })
    open = undefined
  }
  for (const [i, text] of src.split('\n').entries()) {
    if (open) {
      const end = /^\s*(`{3,}|~{3,})\s*$/.exec(text)?.[1]
      if (end && end[0] === open.marker[0] && end.length >= open.marker.length) close()
      else open.body.push(text.replace(new RegExp(`^ {0,${open.indent}}`), ''))
      continue
    }
    const fence = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(text)
    if (fence && !(fence[2]![0] === '`' && fence[3]!.includes('`'))) {
      open = { marker: fence[2]!, indent: fence[1]!.length, kind: fence[3]!.trim().split(/\s+/)[0]!, line: i + 1, body: [] }
      continue
    }
    const heading = /^##\s+(.*)$/.exec(text)
    if (heading) sections.push({ id: /\{#([a-z0-9-]+)\}\s*$/.exec(heading[1]!)?.[1] ?? '', prose: [], fences: [] })
    else sections.at(-1)?.prose.push({ line: i + 1, text })
  }
  if (open) close() // an unclosed fence runs to the end of the file
  return sections
}

function fenceYaml(f: Fence): unknown {
  try {
    return parseYaml(f.body)
  } catch {
    return undefined // validate reports it
  }
}

/** The `query` of a ```check block. */
function checkQuery(f: Fence): string {
  const y = fenceYaml(f)
  return y !== null && typeof y === 'object' && typeof (y as Raw).query === 'string' ? ((y as Raw).query as string) : ''
}

/** The `sql` of each step of a ```steps block. */
function stepsSql(f: Fence): string[] {
  return list(fenceYaml(f)).map(s => String((s as Raw | null)?.sql ?? '')).filter(sql => sql.trim())
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

const USAGE = 'usage: npm run audit [-- [--strict] [--json] [--lesson <id>]]'

/** Runs the audit as the command line does and returns the exit code. */
export async function runCli(args: string[], root: string, print: (text: string) => void = console.log): Promise<number> {
  const opts = { strict: false, json: false, lesson: undefined as string | undefined }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--strict') opts.strict = true
    else if (args[i] === '--json') opts.json = true
    else if (args[i] === '--lesson' && args[i + 1]) opts.lesson = args[++i]
    else {
      print(USAGE)
      return 2
    }
  }

  const full = await audit(root)
  let { lessons, chapters, findings } = full
  if (opts.lesson !== undefined) {
    if (![...lessons, ...chapters].some(l => l.id === opts.lesson)) {
      print(`audit: no lesson or chapter "${opts.lesson}" in the curriculum`)
      return 2
    }
    lessons = lessons.filter(l => l.id === opts.lesson)
    chapters = chapters.filter(l => l.id === opts.lesson)
    findings = findings.filter(f => f.lesson === opts.lesson)
  }
  const units = [...lessons, ...chapters]
  const errors = findings.filter(f => f.level === 'error')
  const code = opts.strict && errors.length ? 1 : 0

  if (opts.json) {
    print(JSON.stringify({ lessons, chapters, findings, summary: summarise(findings) }, null, 2))
    return code
  }
  if (opts.strict) {
    const warnings = findings.length - errors.length
    if (errors.length) {
      print(byLesson(errors, units).join('\n'))
      print(`\n${errors.length} audit error(s) in template-2 lessons. Fix them before committing.`)
    } else {
      print(`Audit: no errors in template-2 lessons (${warnings} warning(s); npm run audit lists them).`)
    }
    return code
  }

  if (findings.length) print(byLesson(findings, units).join('\n') + '\n')
  const rows = summarise(findings).map(r => `${r.rule.padEnd(4)}  ${r.level.padEnd(7)}  ${String(r.findings).padStart(8)}  ${String(r.lessons).padStart(7)}  ${r.title}`)
  print(['rule  level    findings  lessons', ...rows].join('\n'))
  const v2 = lessons.filter(l => l.template >= 2).length
  const flagged = (of: { id: string }[]) => of.filter(u => findings.some(f => f.lesson === u.id)).length
  print(`\nlevel is the template-2 level; legacy lessons report every finding as a warning.`)
  print(`${findings.length} finding(s) in ${flagged(lessons)} of ${lessons.length} lesson(s) and ${flagged(chapters)} of ${chapters.length} chapter(s). ${v2} lesson(s) use template 2, with ${errors.length} error(s).`)
  return code
}

function summarise(findings: Finding[]) {
  return RULES.map(r => {
    const mine = findings.filter(f => f.rule === r.id)
    return { rule: r.id, level: r.level, title: r.title, findings: mine.length, lessons: new Set(mine.map(f => f.lesson)).size }
  })
}

function byLesson(findings: Finding[], lessons: AuditReport['lessons']): string[] {
  const order = RULES.map(r => r.id as string)
  const lines: string[] = []
  for (const { id, template } of lessons) {
    const mine = findings
      .filter(f => f.lesson === id)
      .sort((a, b) => order.indexOf(a.rule) - order.indexOf(b.rule) || (a.exercise ?? '').localeCompare(b.exercise ?? ''))
    if (!mine.length) continue
    lines.push(`${lines.length ? '\n' : ''}${id}  (${template >= 2 ? `template ${template}` : 'legacy: every finding is a warning'})`)
    for (const f of mine) lines.push(`  ${f.level.padEnd(7)}  ${f.rule.padEnd(3)}  ${f.exercise ? `${f.exercise}: ` : ''}${f.message}`)
  }
  return lines
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../content', import.meta.url))
  process.exitCode = await runCli(process.argv.slice(2), root)
}
