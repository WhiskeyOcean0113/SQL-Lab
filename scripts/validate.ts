// Every consistency rule the course must satisfy. Runs before each commit
// and before each build: AI-written content is only trusted once this passes.
//
//   npm run validate

import { fileURLToPath } from 'node:url'
import { gradeRuns, finalResult } from '../src/engine/grade.ts'
import { PracticeDb } from '../src/engine/practice-db.ts'
import { buildContent } from './lib/build-content.ts'
import { runnableBlocks, syntaxBlocks } from './lib/markdown.ts'

/** Section ids in teaching order. Required ones must appear; all must keep this order. */
export const TEMPLATE = ['why', 'core', 'syntax', 'example', 'variants', 'deeper', 'mistakes', 'summary'] as const
const REQUIRED = new Set(['why', 'core', 'example', 'mistakes', 'summary'])
/** Required only from the lesson that teaches the notation onwards: earlier lessons come before it. */
const NOTATION_LESSON = 'sql-syntax'
const MIN_EXERCISES = 4
const MIN_KINDS = 3

export async function validate(root: string): Promise<{ problems: string[]; warnings: string[] }> {
  const { course, problems, sources } = buildContent(root)
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

    if (!course.datasets[lesson.dataset]) continue
    const db = await dbFor(lesson.dataset)
    for (const [i, block] of enRuns.entries()) {
      const r = await db.run(block.sql)
      if (block.expectError && r.ok) problems.push(where(`runnable example ${i + 1} is marked \`error\` but runs without one`))
      if (!block.expectError && !r.ok) problems.push(where(`runnable example ${i + 1} fails: ${r.error?.message}`))
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

  // Glossary hygiene.
  const used = new Set<string>()
  for (const src of Object.values(sources)) {
    for (const text of Object.values(src)) for (const m of text.matchAll(/\{\{[Tt]erm:([a-z0-9-]+)/g)) used.add(m[1]!)
  }
  for (const t of course.glossary) if (!used.has(t.id)) warnings.push(`glossary: "${t.id}" is not used by any lesson yet`)

  for (const db of dbs.values()) await db.close()
  return { problems, warnings }
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
