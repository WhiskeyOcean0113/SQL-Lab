import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildContent } from '../scripts/lib/build-content.ts'
import { Progress, lessonStates, scoreSitting } from '../src/state/progress.ts'
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
    expect(Object.keys(dump)).toEqual(['settings', 'lesson_progress', 'attempts', 'mistake_notes', 'sittings', 'mistake_bank'])
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

describe('Progress: chapter quiz sittings and challenges', () => {
  const m1 = course.modules[0]!
  const quiz = m1.quiz.map(e => e.id)
  const challenge = m1.challenge.map(e => e.id)
  const answer = (sittingId: number, exerciseId: string, isCorrect: boolean) => ({
    exerciseId, lessonId: 'chapter:m1', kind: 'write', lang: 'en' as const, submitted: `answer to ${exerciseId}`, isCorrect, sittingId,
  })
  let q: Progress
  beforeAll(async () => { q = await Progress.open() }, 30_000)
  afterAll(async () => { await q.close() })

  it('keeps one open sitting per chapter and records its answers', async () => {
    const id = await q.startSitting('m1')
    expect(await q.startSitting('m1')).toBe(id)
    expect(await q.openSitting('m1')).toBe(id)
    await q.recordAttempt(answer(id, quiz[0]!, false), course)
    await q.recordAttempt(answer(id, quiz[0]!, true), course) // the latest answer counts
    await q.recordAttempt(answer(id, quiz[1]!, false), course)
    const answers = await q.sittingAnswers(id)
    expect(answers.get(quiz[0]!)).toEqual({ submitted: `answer to ${quiz[0]}`, isCorrect: true })
    expect(answers.get(quiz[1]!)?.isCorrect).toBe(false)
    expect(answers.size).toBe(2)

    await q.finishSitting(id)
    expect(await q.openSitting('m1')).toBeUndefined()
    await expect(q.recordAttempt(answer(id, quiz[2]!, true), course)).rejects.toThrow(/not open/)
    const [sitting] = await q.sittings('m1', m1.lessons)
    expect(sitting).toMatchObject({ id, moduleId: 'm1', lessonsDone: 0 })
    expect(sitting!.finishedAt).toBeInstanceOf(Date)
    expect(await q.sittingCounts()).toEqual(new Map([['m1', 1]]))
  })

  it('keeps quiz answers out of lesson states, exercise status and the mistake bank', async () => {
    const id = await q.startSitting('m1')
    // Even answering every lesson exercise inside a sitting completes nothing.
    for (const ex of course.lessons.basics!.exercises) {
      expect((await q.recordAttempt({ ...answer(id, ex.id, true), lessonId: 'basics' }, course)).lessonCompleted).toBe(false)
    }
    await q.recordAttempt(answer(id, quiz[3]!, false), course)
    expect(await q.doneLessons()).toEqual(new Set())
    expect(await q.solvedExercises()).toEqual(new Set())
    expect(await q.exerciseStatus()).toEqual(new Map())
    expect(await q.mistakes()).toEqual([])
    expect(await q.attemptsFor(quiz[0]!)).toEqual([])
    await q.finishSitting(id)
    expect((await q.sittings('m1', m1.lessons)).map(s => s.id)).toEqual([id - 1, id])
  })

  it('puts challenge attempts in the mistake bank without completing a lesson', async () => {
    const ch = (exerciseId: string, isCorrect: boolean) => ({ ...answer(0, exerciseId, isCorrect), sittingId: undefined })
    await q.recordAttempt(ch(challenge[0]!, false), course)
    expect((await q.recordAttempt(ch(challenge[0]!, true), course)).lessonCompleted).toBe(false)
    expect(await q.mistakes()).toEqual([expect.objectContaining({ exercise_id: challenge[0], lesson_id: 'chapter:m1', wrong_count: 1, correct_streak: 1 })])
    expect((await q.exerciseStatus()).get(challenge[0]!)).toEqual({ solved: true, attempts: 2 })
    expect(await q.doneLessons()).toEqual(new Set())
  })

  it('tells a pre-test from a post-test by the lessons done when it started', async () => {
    for (const ex of course.lessons.basics!.exercises) await q.recordAttempt(attempt(ex.id, true), course)
    expect(await q.doneLessons()).toEqual(new Set(['basics']))
    const id = await q.startSitting('m1')
    const sittings = await q.sittings('m1', m1.lessons)
    expect(sittings.map(s => s.lessonsDone)).toEqual([0, 0, 1])
    expect(await q.sitting('m1', id, m1.lessons)).toMatchObject({ id, lessonsDone: 1, finishedAt: null })
  })
})

describe('scoreSitting', () => {
  it('scores every item, overall and per objective, with unanswered items wrong', () => {
    const quiz = course.modules[0]!.quiz
    const answers = new Map([
      [quiz[0]!.id, { submitted: 'a', isCorrect: true }],
      [quiz[1]!.id, { submitted: 'b', isCorrect: false }],
      [quiz[4]!.id, { submitted: 'c', isCorrect: true }],
    ])
    const s = scoreSitting(quiz, answers)
    expect([s.correct, s.total]).toEqual([2, 6])
    expect(Object.fromEntries(s.byObjective)).toEqual({
      'basics/pick-columns': { correct: 1, total: 2 },
      'basics/order-rows': { correct: 0, total: 2 },
      'basics/predict-filter': { correct: 1, total: 2 },
    })
  })
})

describe('Progress: migration to sittings', () => {
  it('upgrades a version 2 database without losing its history', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sql-lab-progress-'))
    try {
      const old = await PGlite.create({ dataDir: dir })
      await old.exec(readFileSync(new URL('./fixtures/progress-v2.sql', import.meta.url), 'utf8'))
      await old.close()

      const q = await Progress.open(dir)
      expect(SCHEMA_VERSION).toBe(3)
      expect(await q.getSetting('schema_version')).toBe('3')
      expect((await q.attemptsFor('basics/02-fix')).map(a => [a.is_correct, a.revealed])).toEqual([[true, false], [false, true], [false, false]])
      expect(await q.mistakes()).toEqual([expect.objectContaining({ exercise_id: 'basics/02-fix', wrong_count: 2, correct_streak: 1, revealed: true })])
      expect(await q.doneLessons()).toEqual(new Set(['basics']))

      // The new table works on the old data: a sitting after the lesson is a post-test.
      const id = await q.startSitting('m1')
      await q.recordAttempt({ ...attempt('basics/02-fix', false), lessonId: 'chapter:m1', sittingId: id }, course)
      expect((await q.mistakes())[0]).toMatchObject({ wrong_count: 2, correct_streak: 1 })
      expect((await q.sittings('m1', ['basics', 'filtering']))[0]).toMatchObject({ id, lessonsDone: 1 })
      await q.close()

      const again = await Progress.open(dir)
      expect((await again.sittingAnswers(id)).size).toBe(1)
      await again.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
