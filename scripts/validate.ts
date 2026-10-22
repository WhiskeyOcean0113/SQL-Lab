// Every consistency rule the course must satisfy. Runs before each commit
// and before each build: AI-written content is only trusted once this passes.
//
//   npm run validate

import { fileURLToPath } from 'node:url'
import { LANGS } from '../src/content/types.ts'
import { gradeRuns, finalResult } from '../src/engine/grade.ts'
import { PracticeDb } from '../src/engine/practice-db.ts'
import { buildContent } from './lib/build-content.ts'
import { checkBlocks, runnableBlocks, sqlBlocks, stepBlocks, syntaxBlocks } from './lib/markdown.ts'
import { exerciseSql, OPERATORS, sqlWords, wordKind, type Lexicon } from './lib/vocabulary.ts'

/** Section ids in teaching order. Required ones must appear; all must keep this order. */
export const TEMPLATE = ['why', 'core', 'syntax', 'example', 'variants', 'deeper', 'mistakes', 'summary', 'reference'] as const
const REQUIRED = new Set(['why', 'core', 'example', 'mistakes', 'summary'])
/** Required only from the lesson that teaches the notation onwards: earlier lessons come before it. */
const NOTATION_LESSON = 'sql-syntax'
const MIN_EXERCISES = 4
const MIN_KINDS = 3

export async function validate(root: string): Promise<{ problems: string[]; warnings: string[] }> {
  const { course, problems, sources, vocabulary } = buildContent(root)
  const warnings: string[] = []
  const seen = new Set<string>()

  // Curriculum: one linear path, prerequisites always come first.
  course.path.forEach((id, i) => {
    if (seen.has(id)) problems.push(`curriculum: lesson ${id} appears twice`)
    seen.add(id)
    for (const p of course.lessons[id]?.prereqs ?? []) {
      const at = course.path.indexOf(p)
      if (at === -1) problems.push(`lesson ${id}: prereq "${p}" is not in the curriculum`)
      else if (at >= i) problems.push(`lesson ${id}: prereq "${p}" comes after it in the curriculum`)
    }
  })

  const dbs = new Map<string, PracticeDb>()
  const dbFor = async (dataset: string) => {
    if (!dbs.has(dataset)) dbs.set(dataset, await PracticeDb.create(course.datasets[dataset]!))
    return dbs.get(dataset)!
  }

  for (const id of course.path) {
    const lesson = course.lessons[id]
    if (!lesson) continue
    const where = (s: string) => `lesson ${id}: ${s}`

    // Both languages share one structure.
    const zhIds = lesson.body.zh.map(s => s.id)
    const enIds = lesson.body.en.map(s => s.id)
    if (zhIds.join() !== enIds.join()) problems.push(where(`sections differ — zh [${zhIds}] vs en [${enIds}]`))
    let last = -1
    for (const s of enIds) {
      const at = (TEMPLATE as readonly string[]).indexOf(s)
      if (at === -1) problems.push(where(`section "${s}" is not in the teaching template`))
      else if (at < last) problems.push(where(`section "${s}" is out of template order`))
      last = Math.max(last, at)
    }
    for (const r of REQUIRED) if (!enIds.includes(r)) problems.push(where(`missing required section "${r}"`))
    const notationAt = course.path.indexOf(NOTATION_LESSON)
    if (notationAt !== -1 && course.path.indexOf(id) >= notationAt) {
      if (!enIds.includes('syntax')) problems.push(where('missing required section "syntax"'))
    }

    // Runnable examples are code, so both languages must carry identical copies.
    const zhRuns = runnableBlocks(sources[id]?.zh ?? '')
    const enRuns = runnableBlocks(sources[id]?.en ?? '')
    if (JSON.stringify(zhRuns) !== JSON.stringify(enRuns)) problems.push(where('`sql run` blocks differ between zh and en'))
    if (JSON.stringify(syntaxBlocks(sources[id]?.zh ?? '')) !== JSON.stringify(syntaxBlocks(sources[id]?.en ?? ''))) {
      problems.push(where('`syntax` blocks differ between zh and en'))
    }

    // Checkpoints and step-throughs: the code and the answer key are shared; the words are each language's own.
    const zhChecks = checkBlocks(sources[id]?.zh ?? '')
    const enChecks = checkBlocks(sources[id]?.en ?? '')
    if (zhChecks.length !== enChecks.length) problems.push(where(`zh has ${zhChecks.length} \`check\` blocks but en has ${enChecks.length}`))
    else zhChecks.forEach((z, i) => {
      const e = enChecks[i]!
      const diffs = [
        z.query !== e.query && 'query',
        z.answer !== e.answer && 'answer',
        z.choices.length !== e.choices.length && 'number of choices',
        z.verifyRows !== e.verifyRows && 'verify',
      ].filter(Boolean)
      if (diffs.length) problems.push(where(`\`check\` block ${i + 1} differs between zh and en: ${diffs.join(', ')}`))
    })
    const zhSteps = stepBlocks(sources[id]?.zh ?? '')
    const enSteps = stepBlocks(sources[id]?.en ?? '')
    if (zhSteps.length !== enSteps.length) problems.push(where(`zh has ${zhSteps.length} \`steps\` blocks but en has ${enSteps.length}`))
    else zhSteps.forEach((z, b) => {
      const e = enSteps[b]!
      const diffs = z.length !== e.length
        ? [`number of steps (zh ${z.length}, en ${e.length})`]
        : z.flatMap((s, i) => (['sql', 'group'] as const).filter(k => s[k] !== e[i]![k]).map(k => `step ${i + 1} ${k}`))
      if (diffs.length) problems.push(where(`\`steps\` block ${b + 1} differs between zh and en: ${diffs.join(', ')}`))
    })

    if (!course.datasets[lesson.dataset]) continue
    const db = await dbFor(lesson.dataset)
    for (const [i, block] of enRuns.entries()) {
      const r = await db.run(block.sql)
      if (block.expectError && r.ok) problems.push(where(`runnable example ${i + 1} is marked \`error\` but runs without one`))
      if (!block.expectError && !r.ok) problems.push(where(`runnable example ${i + 1} fails: ${r.error?.message}`))
    }
    for (const [i, c] of enChecks.entries()) {
      const r = await db.run(c.query, { limit: Infinity })
      if (!r.ok) { problems.push(where(`check block ${i + 1}: query fails: ${r.error?.message}`)); continue }
      const n = finalResult(r)?.rows.length
      if (c.verifyRows !== undefined && n !== c.verifyRows) problems.push(where(`check block ${i + 1}: verify.rows is ${c.verifyRows} but the query returns ${n ?? 'no'} rows`))
    }
    for (const [b, steps] of enSteps.entries()) {
      for (const [i, s] of steps.entries()) {
        if (!s.sql) continue
        const at = (m: string) => where(`steps block ${b + 1}, step ${i + 1}: ${m}`)
        const r = await db.run(s.sql, { limit: Infinity })
        if (!r.ok) { problems.push(at(`fails: ${r.error?.message}`)); continue }
        const rs = finalResult(r)
        if (!rs) {
          if (s.group) problems.push(at(`groups by "${s.group}" but returns no result set`))
          else warnings.push(at('returns no result set to show'))
        } else if (s.group && !rs.columns.some(c => c.name === s.group)) {
          problems.push(at(`group column "${s.group}" is not in the result (${rs.columns.map(c => c.name).join(', ')})`))
        }
      }
    }

    const kinds = new Set(lesson.exercises.map(e => e.kind))
    if (lesson.exercises.length < MIN_EXERCISES || kinds.size < MIN_KINDS) {
      problems.push(where(`needs at least ${MIN_EXERCISES} exercises of ${MIN_KINDS} kinds (has ${lesson.exercises.length} of ${kinds.size})`))
    }

    for (const ex of lesson.exercises) {
      const at =(s: string) => `exercise ${ex.id}: ${s}`
      if (!enIds.includes(ex.lessonRef)) problems.push(at(`lesson_ref "${ex.lessonRef}" is not a section of ${id}`))

      if (ex.kind === 'predict') {
        const r = await db.run(ex.query, { limit: Infinity })
        if (!r.ok) problems.push(at(`query fails: ${r.error?.message}`))
        else if (ex.verifyRows !== undefined) {
          const n = finalResult(r)?.rows.length
          if (n !== ex.verifyRows) problems.push(at(`verify.rows is ${ex.verifyRows} but the query returns ${n} rows`))
        }
        continue
      }

      if (ex.check.mode === 'probe' && !ex.check.probe) { problems.push(at('check mode "probe" needs a probe query')); continue }
      if (ex.check.mode === 'attempts' && !ex.check.attempts?.length) { problems.push(at('check mode "attempts" needs a list of statements')); continue }
      const inspect = {
        probe: ex.check.mode === 'probe' ? ex.check.probe : undefined,
        attempts: ex.check.mode === 'attempts' ? ex.check.attempts : undefined,
      }
      const solved = await db.run(ex.solution, {
        limit: Infinity,
        snapshot: ex.check.mode === 'tables' ? ex.check.tables : undefined,
        ...inspect,
      })
      if (!solved.ok) { problems.push(at(`solution fails: ${solved.error?.message}`)); continue }
      if (ex.check.mode === 'result') {
        const rs = finalResult(solved)
        if (!rs) problems.push(at('solution returns no result set'))
        else if (rs.rows.length === 0) warnings.push(at('solution returns zero rows; an empty answer is easy to match by accident'))
      } else if (ex.check.mode === 'tables' && !ex.check.tables.length) {
        problems.push(at('check mode "tables" needs a list of tables'))
      } else if (ex.check.mode === 'probe' || ex.check.mode === 'attempts') {
        if (!solved.probe) problems.push(at('the probe query returns no result set'))
        else if (solved.probe.rows.length === 0) warnings.push(at('the probe query returns zero rows after the solution'))
        if (ex.check.mode === 'attempts' && solved.probe && !solved.probe.rows.some(r => r[1] !== 'ok')) {
          warnings.push(at('every attempt succeeds after the solution; add one the constraints should reject'))
        }
        const untouched = await db.run('SELECT 1', inspect)
        if (untouched.ok && untouched.probe && solved.probe
          && gradeRuns(untouched, solved, ex.check).correct) problems.push(at('the probe gives the same result whether or not the solution ran'))
      }

      if (ex.kind === 'debug') {
        const { expected, actual } = await db.runPair(ex.starter, ex.solution, ex.check)
        if (gradeRuns(expected, actual, ex.check).correct) problems.push(at('the broken starter query already passes'))
      }
    }
  }

  // Nothing is used before it is taught.
  await checkVocabulary()

  // Glossary hygiene.
  const used = new Set<string>()
  for (const src of Object.values(sources)) {
    for (const text of Object.values(src)) for (const m of text.matchAll(/\{\{[Tt]erm:([a-z0-9-]+)/g)) used.add(m[1]!)
  }
  for (const t of course.glossary) if (!used.has(t.id)) warnings.push(`glossary: "${t.id}" is not used by any lesson yet`)

  for (const db of dbs.values()) await db.close()
  return { problems, warnings }

  /**
   * Every keyword, function, notable operator and system catalog that a lesson's
   * code or exercises use must be introduced (meta.yaml `introduces`) by that
   * lesson or an earlier one. A lesson body may show a later word if it lists
   * it under `previews` and its prose says what the word is (an overview of the
   * whole SELECT, a keyword shown as a keyword); exercises never preview.
   */
  async function checkVocabulary() {
    const taughtIn = new Map<string, number>()
    course.path.forEach((id, i) => {
      for (const word of vocabulary[id]?.introduces ?? []) {
        const before = taughtIn.get(word)
        if (before !== undefined) problems.push(`lesson ${id}: introduces ${word}, already introduced by ${course.path[before]}`)
        else taughtIn.set(word, i)
      }
    })
    const lexicons = new Map<string, Lexicon>()
    for (const [i, id] of course.path.entries()) {
      const lesson = course.lessons[id]
      if (!lesson || !course.datasets[lesson.dataset]) continue
      if (!lexicons.has(lesson.dataset)) lexicons.set(lesson.dataset, await lexiconOf(await dbFor(lesson.dataset)))
      const lex = lexicons.get(lesson.dataset)!
      const { introduces = [], previews = [] } = vocabulary[id] ?? {}
      for (const word of [...introduces, ...previews]) {
        const ok = { keyword: lex.keywords.has(word.toLowerCase()), function: lex.functions.has(word.slice(0, -2)), operator: true, name: word === word.toLowerCase() }[wordKind(word)]
        if (!ok) problems.push(`lesson ${id}: "${word}" in meta.yaml is not a Postgres keyword (UPPER), function (name()), operator (${OPERATORS.join(' ')}) or lower-case name`)
      }

      const places: { label: string; sql: string; canPreview: boolean }[] = [
        ...[...new Set([...sqlBlocks(sources[id]?.en ?? ''), ...sqlBlocks(sources[id]?.zh ?? '')])]
          .map(sql => ({ label: 'the lesson', sql, canPreview: true })),
        ...[...new Set(LANGS.flatMap(l => checkBlocks(sources[id]?.[l] ?? '').map(c => c.query)))]
          .map(sql => ({ label: 'a `check` block', sql, canPreview: true })),
        ...[...new Set(LANGS.flatMap(l => stepBlocks(sources[id]?.[l] ?? '').flat().map(s => s.sql)))].filter(Boolean)
          .map(sql => ({ label: 'a `steps` block', sql, canPreview: true })),
        ...lesson.exercises.flatMap(ex => exerciseSql(ex).map(sql => ({ label: `exercise ${ex.id}`, sql, canPreview: false }))),
      ]
      const early = new Map<string, Set<string>>()
      const unknown = new Map<string, Set<string>>()
      const used = new Set<string>()
      for (const { label, sql, canPreview } of places) {
        for (const word of sqlWords(sql, lex)) {
          used.add(word)
          const at = taughtIn.get(word)
          const kind = wordKind(word)
          if (at === undefined) {
            if (kind !== 'name' || /^(pg_|information_schema$)/.test(word)) {
              if (kind !== 'keyword' || lex.keywords.has(word.toLowerCase())) (unknown.get(word) ?? unknown.set(word, new Set()).get(word)!).add(label)
            }
          } else if (at > i && !(canPreview && previews.includes(word))) {
            (early.get(word) ?? early.set(word, new Set()).get(word)!).add(label)
          }
        }
      }
      for (const [word, labels] of early) problems.push(`lesson ${id}: uses ${word} in ${[...labels].join(', ')}, but it is introduced later, by ${course.path[taughtIn.get(word)!]}`)
      for (const [word, labels] of unknown) problems.push(`lesson ${id}: uses ${word} in ${[...labels].join(', ')}, which no lesson introduces (add it to the introducing lesson's meta.yaml)`)
      for (const word of introduces) if (!used.has(word)) warnings.push(`lesson ${id}: introduces ${word} but its code never uses it`)
    }
  }
}

/** Postgres's own keyword and function lists, plus the dataset's table and column names. */
async function lexiconOf(db: PracticeDb): Promise<Lexicon> {
  const rows = async (sql: string) => finalResult(await db.run(sql, { limit: Infinity }))?.rows ?? []
  return {
    keywords: new Map((await rows('SELECT word, catcode FROM pg_get_keywords()')).map(r => [String(r[0]), String(r[1])])),
    functions: new Set((await rows('SELECT DISTINCT proname FROM pg_proc')).map(r => String(r[0]))),
    names: new Set((await rows(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
      UNION SELECT column_name FROM information_schema.columns WHERE table_schema = 'public'`)).map(r => String(r[0]))),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../content', import.meta.url))
  const { problems, warnings } = await validate(root)
  const verbose = process.argv.includes('--verbose')
  if (warnings.length) console.log(verbose ? warnings.map(w => `warn  ${w}`).join('\n') : `${warnings.length} warnings (run with --verbose to list)`)
  if (problems.length) {
    console.error(problems.map(p => `error ${p}`).join('\n'))
    console.error(`\n${problems.length} problem(s). Fix them before committing.`)
    process.exit(1)
  }
  console.log('Content is valid.')
}
