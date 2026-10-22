import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { CheckSpec } from '../../src/engine/types.ts'
import { chapterKey, LANGS, type Bi, type Choice, type Course, type Exercise, type Lang, type Lesson, type Module, type Objective, type SetKind, type Term, type Titled, type Trap } from '../../src/content/types.ts'
import { renderInlineText, renderSections, renderSnippet, toPlainText, type RenderEnv } from './markdown.ts'

// Reads content/ and produces the Course the browser loads. Structural
// problems are collected, not thrown, so validate can list all of them at once;
// deeper checks (running solutions, comparing languages) live in validate.ts.

export interface BuildResult {
  course: Course
  problems: string[]
  /** Raw Markdown per lesson and language, for validate's cross-language checks. */
  sources: Record<string, Record<Lang, string>>
  /** Per lesson, the SQL it teaches and the SQL it only previews (meta.yaml), for validate. */
  vocabulary: Record<string, { introduces: string[]; previews: string[] }>
}

type Raw = Record<string, unknown>

function readYaml(path: string): Raw {
  try {
    return parseYaml(readFileSync(path, 'utf8')) as Raw
  } catch (e) {
    throw new Error(`${path}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function bi(value: unknown, where: string, problems: string[]): Bi {
  if (typeof value === 'string') return { zh: value, en: value }
  const v = (value ?? {}) as Partial<Bi>
  for (const l of LANGS) if (typeof v[l] !== 'string' || !v[l]!.trim()) problems.push(`${where}: missing ${l}`)
  // `{ en: Tables, rows and columns }` silently becomes en: "Tables" plus stray keys.
  const extra = Object.keys(v).filter(k => !(LANGS as string[]).includes(k))
  if (extra.length) problems.push(`${where}: unexpected keys ${extra.join(', ')} (quote values that contain commas)`)
  return { zh: v.zh ?? '', en: v.en ?? '' }
}

/** A title with optional `{{term:…}}` markup: every term in it shows both languages. */
function titled(value: unknown, where: string, glossary: Map<string, Term>, problems: string[]): Titled {
  const src = bi(value, where, problems)
  const title = {} as Bi
  const titleHtml = {} as Bi
  for (const lang of LANGS) {
    const env: RenderEnv = { lang, glossary, problems: [] }
    titleHtml[lang] = renderInlineText(src[lang], env)
    title[lang] = toPlainText(renderInlineText(src[lang], { ...env, plain: true }))
    problems.push(...env.problems.map(p => `${where}.${lang}: ${p}`))
  }
  return { title, titleHtml }
}

/** Inline Markdown with terms, e.g. a choice or an objective. */
function inline(value: unknown, where: string, glossary: Map<string, Term>, problems: string[]): Bi {
  const text = bi(value, where, problems)
  const out = {} as Bi
  for (const lang of LANGS) {
    const env: RenderEnv = { lang, glossary, problems: [] }
    out[lang] = renderInlineText(text[lang], env)
    problems.push(...env.problems.map(p => `${where}.${lang}: ${p}`))
  }
  return out
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** meta.yaml `objectives`: `{ id, zh, en }` items, ids kebab-case and unique. */
function objectivesOf(value: unknown, where: (s: string) => string, glossary: Map<string, Term>, problems: string[]): Objective[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) { problems.push(where('objectives must be a list')); return [] }
  const seen = new Set<string>()
  return value.map((o, i) => {
    const { id: rawId, ...text } = (o ?? {}) as Raw
    const id = String(rawId ?? '')
    if (!KEBAB.test(id)) problems.push(where(`objectives[${i}]: id "${id}" is not kebab-case`))
    else if (seen.has(id)) problems.push(where(`objectives[${i}]: id "${id}" appears twice`))
    seen.add(id)
    return { id, text: inline(text, where(`objectives[${i}]`), glossary, problems) }
  })
}

export function buildContent(root: string): BuildResult {
  const problems: string[] = []

  const glossaryRaw = readYaml(join(root, 'glossary.yaml'))
  const glossary: Term[] = Object.entries(glossaryRaw).map(([id, v]) => {
    const t = bi(v, `glossary.${id}`, problems)
    return { id, en: t.en, zh: t.zh }
  })
  const glossaryMap = new Map(glossary.map(t => [t.id, t]))

  const datasets: Record<string, string> = {}
  for (const f of readdirSync(join(root, 'datasets')).filter(f => f.endsWith('.sql'))) {
    datasets[basename(f, '.sql')] = readFileSync(join(root, 'datasets', f), 'utf8')
  }

  const curriculum = readYaml(join(root, 'curriculum.yaml')) as { modules?: Raw[] }
  const modules: Module[] = (curriculum.modules ?? []).map((m, i) => {
    const id = String(m.id ?? `module-${i}`)
    return {
      id,
      ...titled(m.title, `curriculum ${m.id} title`, glossaryMap, problems),
      summary: bi(m.summary, `curriculum ${m.id} summary`, problems),
      lessons: ((m.lessons as string[] | undefined) ?? []).map(String),
      planned: ((m.planned as unknown[] | undefined) ?? []).map((p, j) => titled(p, `curriculum ${m.id} planned[${j}]`, glossaryMap, problems)),
      ...buildChapterSets(root, id, datasets, glossaryMap, problems),
    }
  })
  const path = modules.flatMap(m => m.lessons)

  // A chapter folder must belong to a module.
  const chaptersDir = join(root, 'chapters')
  if (existsSync(chaptersDir)) {
    for (const dir of readdirSync(chaptersDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const mod = modules.find(m => m.id === dir.name)
      if (!mod) problems.push(`chapter ${dir.name}: content/chapters/${dir.name}/ matches no module in curriculum.yaml`)
      else if (!mod.lessons.length) problems.push(`chapter ${dir.name}: has chapter sets but no lessons`)
    }
  }

  const lessons: Record<string, Lesson> = {}
  const sources: BuildResult['sources'] = {}
  const vocabulary: BuildResult['vocabulary'] = {}

  for (const mod of modules) {
    for (const id of mod.lessons) {
      const dir = join(root, 'lessons', id)
      if (!existsSync(dir)) { problems.push(`lesson ${id}: listed in curriculum but content/lessons/${id}/ is missing`); continue }
      const where = (s: string) => `lesson ${id}: ${s}`
      const meta = readYaml(join(dir, 'meta.yaml'))
      vocabulary[id] = {
        introduces: ((meta.introduces as unknown[] | undefined) ?? []).map(String),
        previews: ((meta.previews as unknown[] | undefined) ?? []).map(String),
      }
      const dataset = String(meta.dataset ?? '')
      if (!datasets[dataset]) problems.push(where(`unknown dataset "${dataset}"`))
      if (meta.template !== undefined && meta.template !== 2) problems.push(where('template must be 2, or left out for a legacy lesson'))
      const template = meta.template === 2 ? 2 : 1
      const objectives = objectivesOf(meta.objectives, where, glossaryMap, problems)

      const body = {} as Lesson['body']
      sources[id] = {} as Record<Lang, string>
      for (const lang of LANGS) {
        const file = join(dir, `lesson.${lang}.md`)
        if (!existsSync(file)) { problems.push(where(`missing lesson.${lang}.md`)); body[lang] = []; continue }
        const src = readFileSync(file, 'utf8')
        sources[id][lang] = src
        const env: RenderEnv = { lang, glossary: glossaryMap, problems: [] }
        body[lang] = renderSections(src, env)
        problems.push(...env.problems.map(p => where(`lesson.${lang}.md: ${p}`)))
      }

      const exDir = join(dir, 'exercises')
      const files = existsSync(exDir) ? readdirSync(exDir).filter(f => f.endsWith('.yaml')).sort() : []
      if (!files.length) problems.push(where('has no exercises'))
      const exercises = files.map(f => {
        const stem = basename(f, '.yaml')
        return buildExercise({ id: `${id}/${stem}`, lesson: id }, template, readYaml(join(exDir, f)), glossaryMap, problems)
      })

      lessons[id] = {
        id,
        module: mod.id,
        ...titled(meta.title, where('meta.title'), glossaryMap, problems),
        template,
        summary: bi(meta.summary, where('meta.summary'), problems),
        objectives,
        reference: ((meta.reference as unknown[] | undefined) ?? []).map(String),
        dataset,
        prereqs: ((meta.prereqs as string[] | undefined) ?? []).map(String),
        body,
        exercises,
      }
    }
  }

  return { course: { modules, lessons, path, glossary, datasets }, problems, sources, vocabulary }
}

const SET_KINDS: SetKind[] = ['quiz', 'challenge']
const CHAPTER_META_KEYS = ['dataset', 'quiz_intro', 'challenge_intro']

/**
 * content/chapters/<module>/: an optional meta.yaml (`dataset`, default shop;
 * `quiz_intro`, `challenge_intro`) and the `quiz/` and `challenge/` exercise
 * folders. Items are written to the template-2 rules; quiz items need no hints,
 * since a sitting shows none.
 */
function buildChapterSets(root: string, moduleId: string, datasets: Record<string, string>, glossary: Map<string, Term>, problems: string[]): Pick<Module, 'quiz' | 'challenge' | 'dataset' | 'intro'> {
  const dir = join(root, 'chapters', moduleId)
  const out: Pick<Module, 'quiz' | 'challenge' | 'dataset' | 'intro'> = { quiz: [], challenge: [], dataset: 'shop', intro: {} }
  if (!existsSync(dir)) return out
  const where = (s: string) => `chapter ${moduleId}: ${s}`
  const metaFile = join(dir, 'meta.yaml')
  const meta = existsSync(metaFile) ? (readYaml(metaFile) ?? {}) : {}
  for (const k of Object.keys(meta)) if (!CHAPTER_META_KEYS.includes(k)) problems.push(where(`meta.yaml: unknown key "${k}" (allowed: ${CHAPTER_META_KEYS.join(', ')})`))
  out.dataset = String(meta.dataset ?? 'shop')
  if (!datasets[out.dataset]) problems.push(where(`unknown dataset "${out.dataset}"`))
  for (const kind of SET_KINDS) {
    const introRaw = meta[`${kind}_intro`]
    if (introRaw !== undefined) {
      const text = bi(introRaw, where(`meta.yaml ${kind}_intro`), problems)
      const html = {} as Bi
      for (const lang of LANGS) {
        const env: RenderEnv = { lang, glossary, problems: [] }
        html[lang] = renderSnippet(text[lang], env)
        problems.push(...env.problems.map(p => where(`meta.yaml ${kind}_intro.${lang}: ${p}`)))
      }
      out.intro[kind] = html
    }
    const setDir = join(dir, kind)
    if (!existsSync(setDir)) continue
    const owner = chapterKey(moduleId)
    out[kind] = readdirSync(setDir).filter(f => f.endsWith('.yaml')).sort().map(f => {
      const stem = basename(f, '.yaml')
      return buildExercise({ id: `${owner}/${kind}/${stem}`, lesson: owner, set: { module: moduleId, kind } }, 2, readYaml(join(setDir, f)), glossary, problems)
    })
  }
  return out
}

function buildExercise(at: Pick<Exercise, 'id' | 'lesson' | 'set'>, template: 1 | 2, raw: Raw, glossary: Map<string, Term>, problems: string[]): Exercise {
  const { id, lesson, set } = at
  const where = (s: string) => `exercise ${id}: ${s}`
  const snippet = (v: unknown, field: string): Bi => {
    const text = bi(v, where(field), problems)
    const out = {} as Bi
    for (const lang of LANGS) {
      const env: RenderEnv = { lang, glossary, problems: [] }
      out[lang] = renderSnippet(text[lang], env)
      problems.push(...env.problems.map(p => where(`${field}.${lang}: ${p}`)))
    }
    return out
  }

  const kind = String(raw.kind ?? 'write') as Exercise['kind']
  const difficulty = Number(raw.difficulty ?? 1)
  if (![1, 2, 3].includes(difficulty)) problems.push(where('difficulty must be 1, 2 or 3'))
  const base = {
    id,
    lesson,
    ...(set ? { set } : {}),
    difficulty: difficulty as 1 | 2 | 3,
    prompt: snippet(raw.prompt, 'prompt'),
    hints: hintsOf(),
    explain: raw.explain === undefined ? undefined : snippet(raw.explain, 'explain'),
    objective: raw.objective === undefined ? undefined : String(raw.objective),
    lessonRef: String(raw.lesson_ref ?? ''),
  }

  /** `hints` (1–2 levels); a legacy `hint` is one level. */
  function hintsOf(): Bi[] {
    if (raw.hint !== undefined && raw.hints !== undefined) problems.push(where('has both `hint` and `hints`; keep only `hints`'))
    if (raw.hints === undefined) {
      if (raw.hint === undefined) {
        // A quiz sitting shows no hints, so quiz items may leave them out.
        if (set?.kind !== 'quiz') problems.push(where('missing hints'))
        return []
      }
      if (template === 2) problems.push(where('template-2 lessons use `hints`, not `hint`'))
      return [snippet(raw.hint, 'hint')]
    }
    if (!Array.isArray(raw.hints)) { problems.push(where('`hints` must be a list')); return [] }
    if (raw.hints.length < 1 || raw.hints.length > 2) problems.push(where(`hints has ${raw.hints.length} levels; it needs 1 or 2`))
    return raw.hints.map((h, i) => snippet(h, `hints[${i}]`))
  }

  if (kind === 'predict') {
    if (raw.traps !== undefined) problems.push(where('traps are for write, debug and parsons exercises'))
    const choices = ((raw.choices as unknown[] | undefined) ?? []).map((c, i) => choiceOf(c, `choices[${i}]`))
    const answer = Number(raw.answer)
    if (choices.length < 2) problems.push(where('predict needs at least two choices'))
    if (!(answer >= 0 && answer < choices.length)) problems.push(where('answer must index into choices'))
    const verify = (raw.verify ?? {}) as Raw
    const verifyRows = verify.rows === undefined ? undefined : Number(verify.rows)
    return { ...base, kind, query: String(raw.query ?? '').trim(), choices, answer, explain: snippet(raw.explain, 'explain'), verifyRows }
  }

  /** A string, `{ zh, en }`, or either plus `why`: `{ text, why }`, `{ zh, en, why }`. */
  function choiceOf(c: unknown, field: string): Choice {
    let text = c
    let why: unknown
    if (c !== null && typeof c === 'object' && !Array.isArray(c)) {
      const { why: w, text: t, ...rest } = c as Raw
      why = w
      if (t === undefined) text = rest
      else {
        text = typeof t === 'number' ? String(t) : t
        if (Object.keys(rest).length) problems.push(where(`${field}: use either \`text\` or \`zh\` / \`en\`, not both`))
      }
    }
    const out: Choice = inline(typeof text === 'number' ? String(text) : text, where(field), glossary, problems)
    if (why !== undefined) out.why = snippet(why, `${field}.why`)
    return out
  }

  if (!['write', 'debug', 'parsons'].includes(kind)) problems.push(where(`unknown kind "${kind}"`))
  const solution = String(raw.solution ?? '').trim()
  if (!solution) problems.push(where('missing solution'))
  const c = (raw.check ?? {}) as Raw
  const mode = c.mode === undefined ? 'result' : String(c.mode)
  if (!['result', 'tables', 'probe', 'attempts'].includes(mode)) problems.push(where(`unknown check mode "${mode}"`))
  const check: CheckSpec = {
    mode: mode === 'tables' || mode === 'probe' || mode === 'attempts' ? mode : 'result',
    orderMatters: Boolean(c.order_matters),
    columnNames: Boolean(c.column_names),
    tables: ((c.tables as string[] | undefined) ?? []).map(String),
  }
  if (check.mode === 'probe') check.probe = String(c.probe ?? '').trim()
  if (check.mode === 'attempts') {
    check.attempts = ((c.attempts as unknown[] | undefined) ?? []).map(a => String(a).trim()).filter(Boolean)
    check.orderMatters = true
  }
  const starter = String(raw.starter ?? '').trim()
  if (kind === 'debug' && !starter) problems.push(where('debug needs a starter (the broken query)'))

  let pieces: string[] | undefined
  if (kind === 'parsons') {
    const lines = solution.split('\n').map(l => l.trim()).filter(Boolean)
    const distractors = ((raw.distractors as string[] | undefined) ?? []).map(s => String(s).trim())
    pieces = seededShuffle([...lines, ...distractors], id)
  }

  let traps: Trap[] = []
  if (raw.traps !== undefined && !Array.isArray(raw.traps)) problems.push(where('`traps` must be a list'))
  else if (raw.traps) {
    traps = (raw.traps as unknown[]).map((tr, i) => {
      const t = (tr ?? {}) as Raw
      const sql = String(t.sql ?? '').trim()
      if (!sql) problems.push(where(`traps[${i}]: missing sql`))
      return { sql, say: snippet(t.say, `traps[${i}].say`) }
    })
  }

  return { ...base, kind: kind as 'write' | 'debug' | 'parsons', starter, solution, check, pieces, traps }
}

/** Deterministic shuffle, so a Parsons problem looks the same on every build. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 2 ** 32
  const out = [...items]
  for (let attempt = 0; attempt < 5; attempt++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[out[i], out[j]] = [out[j]!, out[i]!]
    }
    if (out.some((v, i) => v !== items[i])) break
  }
  return out
}
