import { PGlite } from '@electric-sql/pglite'
import type { Issue } from '../engine/types.ts'
import type { Course, Exercise, Lang } from '../content/types.ts'
import { MIGRATIONS, SCHEMA_SQL, SCHEMA_VERSION } from './schema.ts'

export interface AttemptInput {
  exerciseId: string
  lessonId: string
  kind: string
  lang: Lang
  submitted: string
  isCorrect: boolean
  error?: { message: string; code?: string }
  issues?: Issue[]
  /** Show answer was used. Recorded with isCorrect false. */
  revealed?: boolean
  /** A chapter quiz answer: the open sitting it belongs to. Counts towards nothing else. */
  sittingId?: number
}

/** One pass through a chapter quiz. */
export interface Sitting {
  id: number
  moduleId: string
  startedAt: Date
  finishedAt: Date | null
  /** Lessons of the chapter already done when the sitting started: 0 for a pre-test. */
  lessonsDone: number
}

/** A quiz item's latest answer in a sitting. */
export interface SittingAnswer {
  submitted: string
  isCorrect: boolean
}

export interface Score {
  correct: number
  total: number
}

/**
 * A sitting's score, overall and per objective (`<lesson>/<objective>`). Every
 * item counts: one without an answer is wrong. The latest answer per item counts.
 */
export function scoreSitting(items: Exercise[], answers: Map<string, SittingAnswer>): Score & { byObjective: Map<string, Score> } {
  const byObjective = new Map<string, Score>()
  let correct = 0
  for (const ex of items) {
    const right = answers.get(ex.id)?.isCorrect ? 1 : 0
    correct += right
    if (!ex.objective) continue
    const s = byObjective.get(ex.objective) ?? { correct: 0, total: 0 }
    byObjective.set(ex.objective, { correct: s.correct + right, total: s.total + 1 })
  }
  return { correct, total: items.length, byObjective }
}

export interface MistakeRow {
  exercise_id: string
  lesson_id: string
  wrong_count: number
  last_wrong_at: string
  correct_streak: number
  mastered: boolean
  note: string | null
  /** The answer was revealed at least once. */
  revealed: boolean
}

export type LessonState = 'done' | 'available'

/**
 * Every lesson is open at any time; the path order is a recommendation, not a
 * gate. A lesson is done once every one of its exercises has been solved.
 */
export function lessonStates(path: string[], done: Set<string>): Record<string, LessonState> {
  return Object.fromEntries(path.map(id => [id, done.has(id) ? 'done' : 'available']))
}

export class Progress {
  private constructor(private db: PGlite) {}

  /** `dataDir` is `idb://sql-lab` in the browser; omit it for an in-memory store in tests. */
  static async open(dataDir?: string): Promise<Progress> {
    const db = await PGlite.create(dataDir ? { dataDir } : {})
    const from = await storedVersion(db)
    await db.transaction(async tx => {
      for (let v = from + 1; from > 0 && v <= SCHEMA_VERSION; v++) {
        const step = MIGRATIONS[v]
        if (step) await tx.exec(step)
      }
      await tx.exec(SCHEMA_SQL)
      await tx.query(`INSERT INTO settings (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [String(SCHEMA_VERSION)])
    })
    return new Progress(db)
  }

  async getSetting(key: string): Promise<string | undefined> {
    const r = await this.db.query<{ value: string }>('SELECT value FROM settings WHERE key = $1', [key])
    return r.rows[0]?.value
  }

  async setSetting(key: string, value: string) {
    await this.db.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value])
  }

  async startLesson(lessonId: string) {
    await this.db.query(`INSERT INTO lesson_progress (lesson_id, status) VALUES ($1, 'reading') ON CONFLICT DO NOTHING`, [lessonId])
  }

  async doneLessons(): Promise<Set<string>> {
    const r = await this.db.query<{ lesson_id: string }>(`SELECT lesson_id FROM lesson_progress WHERE status = 'done'`)
    return new Set(r.rows.map(x => x.lesson_id))
  }

  /** Exercise ids answered correctly at least once, outside quiz sittings. */
  async solvedExercises(): Promise<Set<string>> {
    const r = await this.db.query<{ exercise_id: string }>('SELECT DISTINCT exercise_id FROM attempts WHERE is_correct AND sitting_id IS NULL')
    return new Set(r.rows.map(x => x.exercise_id))
  }

  /**
   * Record a submission. When it completes the lesson (every exercise answered
   * correctly at least once), mark the lesson done and say so. A quiz answer
   * (`sittingId`) goes to its open sitting and completes nothing.
   */
  async recordAttempt(a: AttemptInput, course: Course): Promise<{ lessonCompleted: boolean }> {
    if (a.sittingId !== undefined) {
      const open = await this.db.query('SELECT 1 FROM sittings WHERE id = $1 AND finished_at IS NULL', [a.sittingId])
      if (!open.rows.length) throw new Error(`Sitting ${a.sittingId} is not open`)
    }
    await this.db.query(
      `INSERT INTO attempts (exercise_id, lesson_id, kind, lang, submitted, is_correct, error, error_code, issues, revealed, sitting_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [a.exerciseId, a.lessonId, a.kind, a.lang, a.submitted, a.isCorrect, a.error?.message ?? null, a.error?.code ?? null, a.issues ? JSON.stringify(a.issues) : null, Boolean(a.revealed), a.sittingId ?? null],
    )
    if (!a.isCorrect || a.sittingId !== undefined) return { lessonCompleted: false }
    const lesson = course.lessons[a.lessonId]
    if (!lesson) return { lessonCompleted: false }
    const solved = await this.solvedExercises()
    if (!lesson.exercises.every(e => solved.has(e.id))) return { lessonCompleted: false }
    if ((await this.doneLessons()).has(a.lessonId)) return { lessonCompleted: false }
    await this.db.query(
      `INSERT INTO lesson_progress (lesson_id, status, done_at) VALUES ($1, 'done', now())
       ON CONFLICT (lesson_id) DO UPDATE SET status = 'done', done_at = now()`,
      [a.lessonId],
    )
    return { lessonCompleted: true }
  }

  /** Per exercise: ever solved, and how many submissions so far (reveals are not submissions). Quiz answers do not count. */
  async exerciseStatus(): Promise<Map<string, { solved: boolean; attempts: number }>> {
    const r = await this.db.query<{ exercise_id: string; solved: boolean; attempts: number }>(
      'SELECT exercise_id, bool_or(is_correct) AS solved, (count(*) FILTER (WHERE NOT revealed))::int AS attempts FROM attempts WHERE sitting_id IS NULL GROUP BY exercise_id',
    )
    return new Map(r.rows.map(x => [x.exercise_id, { solved: x.solved, attempts: x.attempts }]))
  }

  async attemptsFor(exerciseId: string) {
    const r = await this.db.query<{ submitted: string; is_correct: boolean; revealed: boolean; created_at: Date }>(
      'SELECT submitted, is_correct, revealed, created_at FROM attempts WHERE exercise_id = $1 AND sitting_id IS NULL ORDER BY id DESC LIMIT 20',
      [exerciseId],
    )
    return r.rows
  }

  /* ---------- chapter quiz sittings ---------- */

  /** The module's unfinished sitting, or a new one. */
  async startSitting(moduleId: string): Promise<number> {
    const open = await this.openSitting(moduleId)
    if (open !== undefined) return open
    const r = await this.db.query<{ id: number }>('INSERT INTO sittings (module_id) VALUES ($1) RETURNING id', [moduleId])
    return Number(r.rows[0]!.id)
  }

  /** Id of the module's unfinished sitting, if there is one. */
  async openSitting(moduleId: string): Promise<number | undefined> {
    const r = await this.db.query<{ id: number }>('SELECT id FROM sittings WHERE module_id = $1 AND finished_at IS NULL', [moduleId])
    return r.rows[0] ? Number(r.rows[0].id) : undefined
  }

  async finishSitting(id: number) {
    await this.db.query('UPDATE sittings SET finished_at = now() WHERE id = $1 AND finished_at IS NULL', [id])
  }

  /**
   * A module's sittings, oldest first. `lessons` are the chapter's lesson ids:
   * how many were done when a sitting started tells a pre-test from a post-test.
   */
  async sittings(moduleId: string, lessons: string[]): Promise<Sitting[]> {
    const r = await this.db.query<{ id: number; module_id: string; started_at: Date; finished_at: Date | null; lessons_done: number }>(
      `SELECT s.id, s.module_id, s.started_at, s.finished_at,
              (SELECT count(*) FROM lesson_progress p
                WHERE p.status = 'done' AND p.done_at <= s.started_at AND p.lesson_id = ANY($2))::int AS lessons_done
       FROM sittings s WHERE s.module_id = $1 ORDER BY s.id`,
      [moduleId, lessons],
    )
    return r.rows.map(x => ({ id: Number(x.id), moduleId: x.module_id, startedAt: x.started_at, finishedAt: x.finished_at, lessonsDone: x.lessons_done }))
  }

  /** One sitting of a module, as `sittings` lists it. */
  async sitting(moduleId: string, id: number, lessons: string[]): Promise<Sitting | undefined> {
    return (await this.sittings(moduleId, lessons)).find(s => s.id === id)
  }

  /** Each item's latest answer in a sitting. */
  async sittingAnswers(id: number): Promise<Map<string, SittingAnswer>> {
    const r = await this.db.query<{ exercise_id: string; submitted: string; is_correct: boolean }>(
      `SELECT DISTINCT ON (exercise_id) exercise_id, submitted, is_correct
       FROM attempts WHERE sitting_id = $1 ORDER BY exercise_id, id DESC`,
      [id],
    )
    return new Map(r.rows.map(x => [x.exercise_id, { submitted: x.submitted, isCorrect: x.is_correct }]))
  }

  /** Per module: how many sittings, finished or not. */
  async sittingCounts(): Promise<Map<string, number>> {
    const r = await this.db.query<{ module_id: string; n: number }>('SELECT module_id, count(*)::int AS n FROM sittings GROUP BY module_id')
    return new Map(r.rows.map(x => [x.module_id, x.n]))
  }

  async mistakes(): Promise<MistakeRow[]> {
    const r = await this.db.query<MistakeRow>('SELECT * FROM mistake_bank ORDER BY mastered, last_wrong_at DESC')
    return r.rows.map(row => ({ ...row, wrong_count: Number(row.wrong_count), correct_streak: Number(row.correct_streak) }))
  }

  async setNote(exerciseId: string, note: string) {
    if (!note.trim()) await this.db.query('DELETE FROM mistake_notes WHERE exercise_id = $1', [exerciseId])
    else await this.db.query(
      `INSERT INTO mistake_notes (exercise_id, note) VALUES ($1, $2)
       ON CONFLICT (exercise_id) DO UPDATE SET note = $2, updated_at = now()`,
      [exerciseId, note],
    )
  }

  /** Everything, as plain JSON: the raw material for a later "analyse my mistakes" export. */
  async exportAll() {
    const tables = ['settings', 'lesson_progress', 'attempts', 'mistake_notes', 'sittings'] as const
    const out: Record<string, unknown[]> = {}
    for (const t of tables) out[t] = (await this.db.query(`SELECT * FROM ${t}`)).rows
    out.mistake_bank = (await this.db.query('SELECT * FROM mistake_bank')).rows
    return out
  }

  async close() {
    await this.db.close()
  }
}

/** The schema version a database was last opened with; 0 for a new, empty one. */
async function storedVersion(db: PGlite): Promise<number> {
  const exists = await db.query<{ ok: boolean }>(`SELECT to_regclass('public.settings') IS NOT NULL AS ok`)
  if (!exists.rows[0]?.ok) return 0
  const r = await db.query<{ value: string }>(`SELECT value FROM settings WHERE key = 'schema_version'`)
  // Version 1 always wrote its number; a settings table without one is version 1 too.
  return Number(r.rows[0]?.value ?? 1)
}
