import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { CheckSpec } from '../../src/engine/types.ts'
import { LANGS, type Bi, type Course, type Exercise, type Lang, type Lesson, type Module, type Term } from '../../src/content/types.ts'
import { renderInlineText, renderSections, renderSnippet, type RenderEnv } from './markdown.ts'

// Reads content/ and produces the Course the browser loads. Structural
// problems are collected, not thrown, so validate can list all of them at once;
// deeper checks (running solutions, comparing languages) live in validate.ts.

export interface BuildResult {
  course: Course
  problems: string[]
  /** Raw Markdown per lesson and language, for validate's cross-language checks. */
  sources: Record<string, Record<Lang, string>>
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
  return { zh: v.zh ?? '', en: v.en ?? '' }
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
  const modules: Module[] = (curriculum.modules ?? []).map((m, i) => ({
    id: String(m.id ?? `module-${i}`),
    title: bi(m.title, `curriculum ${m.id} title`, problems),
    summary: bi(m.summary, `curriculum ${m.id} summary`, problems),
    lessons: ((m.lessons as string[] | undefined) ?? []).map(String),
    planned: ((m.planned as unknown[] | undefined) ?? []).map((p, j) => bi(p, `curriculum ${m.id} planned[${j}]`, problems)),
  }))
  const path = modules.flatMap(m => m.lessons)

  const lessons: Record<string, Lesson> = {}
  const sources: BuildResult['sources'] = {}

  for (const mod of modules) {
    for (const id of mod.lessons) {
      const dir = join(root, 'lessons', id)
      if (!existsSync(dir)) { problems.push(`lesson ${id}: listed in curriculum but content/lessons/${id}/ is missing`); continue }
      const where = (s: string) => `lesson ${id}: ${s}`
      const meta = readYaml(join(dir, 'meta.yaml'))
      const dataset = String(meta.dataset ?? '')
      if (!datasets[dataset]) problems.push(where(`unknown dataset "${dataset}"`))

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
      const exercises = files.map(f => buildExercise(id, basename(f, '.yaml'), readYaml(join(exDir, f)), glossaryMap, problems))

      lessons[id] = {
        id,
        module: mod.id,
        title: bi(meta.title, where('meta.title'), problems),
        summary: bi(meta.summary, where('meta.summary'), problems),
        dataset,
        prereqs: ((meta.prereqs as string[] | undefined) ?? []).map(String),
        body,
        exercises,
      }
    }
  }

  return { course: { modules, lessons, path, glossary, datasets }, problems, sources }
}

function buildExercise(lesson: string, stem: string, raw: Raw, glossary: Map<string, Term>, problems: string[]): Exercise {
  const id = `${lesson}/${stem}`
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
    difficulty: difficulty as 1 | 2 | 3,
    prompt: snippet(raw.prompt, 'prompt'),
    hint: snippet(raw.hint, 'hint'),
    lessonRef: String(raw.lesson_ref ?? ''),
  }

  if (kind === 'predict') {
    const choices = ((raw.choices as unknown[] | undefined) ?? []).map((c, i) => {
      const text = bi(c, where(`choices[${i}]`), problems)
      const out = {} as Bi
      for (const lang of LANGS) out[lang] = renderInlineText(text[lang], { lang, glossary, problems })
      return out
    })
    const answer = Number(raw.answer)
    if (choices.length < 2) problems.push(where('predict needs at least two choices'))
    if (!(answer >= 0 && answer < choices.length)) problems.push(where('answer must index into choices'))
    const verify = (raw.verify ?? {}) as Raw
    const verifyRows = verify.rows === undefined ? undefined : Number(verify.rows)
    return { ...base, kind, query: String(raw.query ?? '').trim(), choices, answer, explain: snippet(raw.explain, 'explain'), verifyRows }
  }

  if (!['write', 'debug', 'parsons'].includes(kind)) problems.push(where(`unknown kind "${kind}"`))
  const solution = String(raw.solution ?? '').trim()
  if (!solution) problems.push(where('missing solution'))
  const c = (raw.check ?? {}) as Raw
  const check: CheckSpec = {
    mode: c.mode === 'tables' ? 'tables' : 'result',
    orderMatters: Boolean(c.order_matters),
    columnNames: Boolean(c.column_names),
    tables: ((c.tables as string[] | undefined) ?? []).map(String),
  }
  const starter = String(raw.starter ?? '').trim()
  if (kind === 'debug' && !starter) problems.push(where('debug needs a starter (the broken query)'))

  let pieces: string[] | undefined
  if (kind === 'parsons') {
    const lines = solution.split('\n').map(l => l.trim()).filter(Boolean)
    const distractors = ((raw.distractors as string[] | undefined) ?? []).map(s => String(s).trim())
    pieces = seededShuffle([...lines, ...distractors], id)
  }

  return { ...base, kind: kind as 'write' | 'debug' | 'parsons', starter, solution, check, pieces }
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
