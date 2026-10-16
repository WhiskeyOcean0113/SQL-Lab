import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildContent } from '../scripts/lib/build-content.ts'
import { Progress, lessonStates } from '../src/state/progress.ts'

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
  })
})
