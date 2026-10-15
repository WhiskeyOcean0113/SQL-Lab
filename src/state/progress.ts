import { PGlite } from '@electric-sql/pglite'
import type { Issue } from '../engine/types.ts'
import type { Course, Lang } from '../content/types.ts'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.ts'

export interface AttemptInput {
  exerciseId: string
  lessonId: string
  kind: string
  lang: Lang
  submitted: string
  isCorrect: boolean
  error?: { message: string; code?: string }
  issues?: Issue[]
}

export interface MistakeRow {
  exercise_id: string
  lesson_id: string
  wrong_count: number
  last_wrong_at: string
  correct_streak: number
  mastered: boolean
  note: string | null
}

export type LessonState = 'done' | 'available' | 'locked'

/**
 * Strict linear unlocking: every finished lesson stays open, and exactly one
 * more, the first unfinished lesson on the path. Nothing can be skipped.
 */
export function lessonStates(path: string[], done: Set<string>): Record<string, LessonState> {
  const out: Record<string, LessonState> = {}
  let frontierFound = false
  for (const id of path) {
    if (done.has(id) && !frontierFound) out[id] = 'done'
    else if (!frontierFound) { out[id] = 'available'; frontierFound = true }
    else out[id] = 'locked'
  }
  return out
}

export class Progress {
  private constructor(private db: PGlite) {}

  /** `dataDir` is `idb://sql-lab` in the browser; omit it for an in-memory store in tests. */
  static async open(dataDir?: string): Promise<Progress> {
    const db = await PGlite.create(dataDir ? { dataDir } : {})
    await db.exec(SCHEMA_SQL)
    await db.query(`INSERT INTO settings (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [String(SCHEMA_VERSION)])
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

  /** Exercise ids answered correctly at least once. */
  async solvedExercises(): Promise<Set<string>> {
    const r = await this.db.query<{ exercise_id: string }>('SELECT DISTINCT exercise_id FROM attempts WHERE is_correct')
    return new Set(r.rows.map(x => x.exercise_id))
  }

  /**
   * Record a submission. When it completes the lesson (every exercise answered
   * correctly at least once), mark the lesson done and say so.
   */
  async recordAttempt(a: AttemptInput, course: Course): Promise<{ lessonCompleted: boolean }> {
    await this.db.query(
      `INSERT INTO attempts (exercise_id, lesson_id, kind, lang, submitted, is_correct, error, error_code, issues)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [a.exerciseId, a.lessonId, a.kind, a.lang, a.submitted, a.isCorrect, a.error?.message ?? null, a.error?.code ?? null, a.issues ? JSON.stringify(a.issues) : null],
    )
    if (!a.isCorrect) return { lessonCompleted: false }
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

  /** Per exercise: ever solved, and how many submissions so far. */
  async exerciseStatus(): Promise<Map<string, { solved: boolean; attempts: number }>> {
    const r = await this.db.query<{ exercise_id: string; solved: boolean; attempts: number }>(
      'SELECT exercise_id, bool_or(is_correct) AS solved, count(*)::int AS attempts FROM attempts GROUP BY exercise_id',
    )
    return new Map(r.rows.map(x => [x.exercise_id, { solved: x.solved, attempts: x.attempts }]))
  }

  async attemptsFor(exerciseId: string) {
    const r = await this.db.query<{ submitted: string; is_correct: boolean; created_at: Date }>(
      'SELECT submitted, is_correct, created_at FROM attempts WHERE exercise_id = $1 ORDER BY id DESC LIMIT 20',
      [exerciseId],
    )
    return r.rows
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
    const tables = ['settings', 'lesson_progress', 'attempts', 'mistake_notes'] as const
    const out: Record<string, unknown[]> = {}
    for (const t of tables) out[t] = (await this.db.query(`SELECT * FROM ${t}`)).rows
    out.mistake_bank = (await this.db.query('SELECT * FROM mistake_bank')).rows
    return out
  }

  async close() {
    await this.db.close()
  }
}
