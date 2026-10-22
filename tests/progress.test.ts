import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildContent } from '../scripts/lib/build-content.ts'
import { Progress, lessonStates } from '../src/state/progress.ts'
import { SCHEMA_VERSION } from '../src/state/schema.ts'

const { course } = buildContent(fileURLToPath(new URL('./fixtures/content', import.meta.url)))
const ids = course.lessons.basics!.exercises.map(e => e.id)
const attempt = (exerciseId: string, isCorrect: boolean) => ({
  exerciseId, lessonId: 'basics', kind: 'write', lang: 'zh' as const, submitted: 'SELECT 1', isCorrect,
})

let p: Progress
beforeAll(async () => { p = await Progress.open() }, 30_000)
afterAll(async () => { await p.close() })

describe('lessonStates', () => {
  it('opens every lesson, finished or not', () => {
    expect(lessonStates(['a', 'b', 'c'], new Set())).toEqual({ a: 'available', b: 'available', c: 'available' })
    expect(lessonStates(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual({ a: 'done', b: 'available', c: 'done' })
  })
})

describe('Progress', () => {
  it('completes a lesson only when every exercise has been answered correctly', async () => {
    const [first, ...rest] = ids
    expect((await p.recordAttempt(attempt(first!, true), course)).lessonCompleted).toBe(false)
    for (const id of rest.slice(0, -1)) await p.recordAttempt(attempt(id, true), course)
    await p.recordAttempt(attempt(rest.at(-1)!, false), course)
    expect(await p.doneLessons()).toEqual(new Set())
    expect((await p.recordAttempt(attempt(rest.at(-1)!, true), course)).lessonCompleted).toBe(true)
    expect(await p.doneLessons()).toEqual(new Set(['basics']))
    expect((await p.recordAttempt(attempt(first!, true), course)).lessonCompleted).toBe(false)
  })

  it('masters a mistake after N correct answers in a row since the last wrong one', async () => {
    const id = ids[0]!
    await p.recordAttempt(attempt(id, false), course)
    let row = (await p.mistakes()).find(m => m.exercise_id === id)!
    expect(row).toMatchObject({ wrong_count: 1, correct_streak: 0, mastered: false })

    await p.recordAttempt(attempt(id, true), course)
    await p.recordAttempt(attempt(id, false), course) // streak resets
    await p.recordAttempt(attempt(id, true), course)
    row = (await p.mistakes()).find(m => m.exercise_id === id)!
    expect(row).toMatchObject({ wrong_count: 2, correct_streak: 1, mastered: false })

    await p.recordAttempt(attempt(id, true), course)
    row = (await p.mistakes()).find(m => m.exercise_id === id)!
    expect(row.mastered).toBe(true)
  })

  it('reads the streak length from settings', async () => {
    await p.setSetting('mastery_streak', '3')
    expect((await p.mistakes()).find(m => m.exercise_id === ids[0])!.mastered).toBe(false)
    await p.setSetting('mastery_streak', '2')
  })

  it('stores notes and exports everything', async () => {
    await p.setNote(ids[0]!, 'forgot NULL is not > 2')
    expect((await p.mistakes()).find(m => m.exercise_id === ids[0])!.note).toBe('forgot NULL is not > 2')
    const dump = await p.exportAll()
    expect(Object.keys(dump)).toEqual(['settings', 'lesson_progress', 'attempts', 'mistake_notes', 'mistake_bank'])
    expect(dump.attempts![0]).toHaveProperty('revealed', false)
  })
})

describe('Progress: Show answer', () => {
  let q: Progress
  beforeAll(async () => { q = await Progress.open() }, 30_000)
  afterAll(async () => { await q.close() })
  const reveal = (exerciseId: string) => ({ ...attempt(exerciseId, false), submitted: '', revealed: true })

  it('records a reveal as a wrong attempt that puts the exercise in the mistake bank', async () => {
    const id = ids[0]!
    await q.recordAttempt(attempt(id, false), course)
    await q.recordAttempt(reveal(id), course)
    expect((await q.attemptsFor(id))[0]).toMatchObject({ is_correct: false, revealed: true })
    expect((await q.mistakes()).find(m => m.exercise_id === id)).toMatchObject({ wrong_count: 2, revealed: true, mastered: false })
    expect(await q.solvedExercises()).toEqual(new Set())
    // A reveal is not a submission.
    expect((await q.exerciseStatus()).get(id)).toEqual({ solved: false, attempts: 1 })
    const dump = await q.exportAll()
    expect(dump.attempts!.map(a => (a as { revealed: boolean }).revealed)).toEqual([false, true])
  })

  it('solves the exercise only with a later correct submission, and the lesson only then', async () => {
    const [first, ...rest] = ids
    for (const id of rest) await q.recordAttempt(attempt(id, true), course)
    await q.recordAttempt(reveal(first!), course)
    expect(await q.doneLessons()).toEqual(new Set())
    expect((await q.recordAttempt(attempt(first!, true), course)).lessonCompleted).toBe(true)
    expect((await q.exerciseStatus()).get(first!)).toEqual({ solved: true, attempts: 2 })
    // The streak counts from the reveal, like from any wrong answer.
    expect((await q.mistakes()).find(m => m.exercise_id === first)).toMatchObject({ correct_streak: 1, mastered: false })
    expect(lessonStates(course.path, await q.doneLessons()).basics).toBe('done')
  })
})

describe('Progress: schema migration', () => {
  it('upgrades a version 1 database without losing its history', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sql-lab-progress-'))
    try {
      const old = await PGlite.create({ dataDir: dir })
      await old.exec(readFileSync(new URL('./fixtures/progress-v1.sql', import.meta.url), 'utf8'))
      await old.close()

      const q = await Progress.open(dir)
      expect(await q.getSetting('schema_version')).toBe(String(SCHEMA_VERSION))
      expect(await q.getSetting('lang')).toBe('zh')
      const history = await q.attemptsFor('basics/02-fix')
      expect(history.map(a => [a.submitted, a.is_correct, a.revealed])).toEqual([
        ['SELECT name FROM pets', true, false],
        ['SELECT nam FROM pets', false, false],
      ])
      expect(await q.mistakes()).toEqual([expect.objectContaining({
        exercise_id: 'basics/02-fix', wrong_count: 1, correct_streak: 1, note: 'typo in the column name', revealed: false,
      })])
      await q.recordAttempt({ ...attempt('basics/02-fix', false), revealed: true }, course)
      expect((await q.mistakes())[0]).toMatchObject({ wrong_count: 2, correct_streak: 0, revealed: true })
      await q.close()

      // Opening again is a no-op.
      const again = await Progress.open(dir)
      expect((await again.attemptsFor('basics/02-fix')).length).toBe(3)
      await again.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
